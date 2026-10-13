// App state: the signed-in person, cached content, their event log and
// Roadmap, plus the sync engine that merges devices.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { auth, friendly, loadContent, profileApi, supabase, syncApi } from '../lib/api';
import { events as evStore, kv, outbox, roadmap as rmStore, openUserDb } from '../lib/db';
import { derive, type Derived } from '../lib/derive';
import { deviceTimeZone, localDate } from '../lib/time';
import type { Content, EventKind, Prefs, Profile, ProgressEvent, RoadmapStep } from '../lib/types';
import { ROADMAP_STEPS, currentStepLabel } from '../lib/roadmap';

export interface Store {
  ready: boolean; session: Session | null; profile: Profile | null; content: Content | null;
  events: ProgressEvent[]; derived: Derived; roadmap: Record<string, RoadmapStep>;
  online: boolean; syncing: boolean; lastSync: string | null; syncError: string | null; prefs: Prefs; isStaff: boolean;
  record: (kind: EventKind, payload?: Record<string, unknown>, xp?: number) => Promise<ProgressEvent>;
  recordMany: (list: Array<{ kind: EventKind; payload?: Record<string, unknown>; xp?: number }>) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  setPrefs: (patch: Partial<Prefs>) => Promise<void>;
  saveStep: (key: string, patch: Partial<RoadmapStep>) => Promise<void>;
  sync: () => Promise<void>;
  reloadContent: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error('store'); return s; };

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [roadmap, setRoadmap] = useState<Record<string, RoadmapStep>>({});
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const syncLock = useRef(false);
  const userId = session?.user.id ?? null;

  // Clock tick so hearts and the day boundary refresh on their own.
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  useEffect(() => {
    auth.session().then((s) => { setSession(s); if (!s) setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { data.subscription.unsubscribe(); removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);

  // Load what's on the device first, then sync.
  useEffect(() => {
    if (!userId) { setProfile(null); setContent(null); setEvents([]); setRoadmap({}); return; }
    let cancelled = false;
    (async () => {
      openUserDb(userId);
      const [p, c, ev, rm, ls] = await Promise.all([kv.get<Profile>('profile'), kv.get<Content>('content'), evStore.all(), rmStore.all(), kv.get<string>('lastSync')]);
      if (cancelled) return;
      if (p) setProfile(p);
      if (c) setContent(c);
      setEvents(ev);
      setRoadmap(Object.fromEntries(rm.map((s) => [s.step_key, s])));
      setLastSync(ls ?? null);
      if (p && c) setReady(true);
      await doSync(userId, true);
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const doSync = useCallback(async (uid: string, full = false) => {
    if (syncLock.current || !navigator.onLine) return;
    syncLock.current = true; setSyncing(true);
    try {
      await profileApi.touch(deviceTimeZone());
      // Profile: apply any edits made offline, then take the server copy.
      const pending = await kv.get<Partial<Profile>>('profilePending');
      let p = pending && Object.keys(pending).length ? await profileApi.update(uid, pending) : await profileApi.get(uid);
      await kv.del('profilePending');
      const localPrefs = await kv.get<{ prefs: Prefs; at: string }>('prefsLocal');
      if (localPrefs && localPrefs.at > p.prefs_updated_at) {
        const merged = await profileApi.mergePrefs(localPrefs.prefs, localPrefs.at);
        p = { ...p, prefs: merged.prefs, prefs_updated_at: merged.at };
      }
      await kv.del('prefsLocal');
      await kv.set('profile', p); setProfile(p);

      if (full || !(await kv.get('content'))) {
        const c = await loadContent();
        await kv.set('content', c); setContent(c);
      }

      // Events: push what this device has, then pull what other devices added.
      const unsynced = await evStore.unsynced();
      for (let i = 0; i < unsynced.length; i += 200) {
        const chunk = unsynced.slice(i, i + 200);
        await syncApi.push(chunk);
        await evStore.markSynced(chunk.map((e) => e.id));
      }
      let seq = (await kv.get<number>('pullSeq')) ?? 0;
      for (;;) {
        const rows = await syncApi.pull(uid, seq);
        if (!rows.length) break;
        await evStore.putMany(rows);
        seq = Math.max(seq, ...rows.map((r) => r.seq ?? 0));
        await kv.set('pullSeq', seq);
        if (rows.length < 1000) break;
      }
      const evAll = await evStore.all();
      for (const item of await outbox.all()) {
        if (item.type === 'flag') {
          const b = item.body as { item_type: string; item_id: string; note: string };
          await syncApi.flag(b.item_type, b.item_id, b.note);
          await outbox.remove(item.id);
        }
      }
      setEvents(evAll);

      // Roadmap: last write wins per step.
      const local = await rmStore.all();
      for (const s of local.filter((x) => x.dirty)) { await syncApi.upsertRoadmap(s); await rmStore.put({ ...s, dirty: 0 }); }
      const server = await syncApi.roadmap();
      const merged: Record<string, RoadmapStep> = Object.fromEntries(local.map((s) => [s.step_key, { ...s, dirty: 0 as const }]));
      for (const s of server) if (!merged[s.step_key] || merged[s.step_key].updated_at <= s.updated_at) { merged[s.step_key] = { ...s, dirty: 0 }; await rmStore.put(merged[s.step_key]); }
      setRoadmap(merged);

      // Snapshot for the Admin dashboard and the streak-saver email.
      const d = derive(evAll, { today: localDate(), now: Date.now(), dailyGoal: p.daily_goal });
      await syncApi.stats({
        user_id: uid, xp_total: d.xpTotal, streak: d.streak, longest_streak: d.longestStreak, last_study_date: d.lastStudyDate,
        units_completed: d.completedUnits.size, lessons_completed: d.completedLessons.size,
        roadmap_step: currentStepLabel(merged), accuracy: d.answeredCount ? Math.round((1000 * d.correctCount) / d.answeredCount) / 10 : null,
        updated_at: new Date().toISOString(),
      });
      const now = new Date().toISOString();
      await kv.set('lastSync', now); setLastSync(now); setSyncError(null);
    } catch (e) {
      setSyncError(friendly(e));
    } finally {
      syncLock.current = false; setSyncing(false);
    }
  }, []);

  const sync = useCallback(async () => { if (userId) await doSync(userId); }, [userId, doSync]);
  const reloadContent = useCallback(async () => { if (userId) await doSync(userId, true); }, [userId, doSync]);

  // Sync when coming back online, when the app comes to the foreground, and every 2 minutes.
  useEffect(() => {
    if (!userId) return;
    const vis = () => { if (document.visibilityState === 'visible') doSync(userId); };
    document.addEventListener('visibilitychange', vis);
    const t = setInterval(() => doSync(userId), 120000);
    return () => { document.removeEventListener('visibilitychange', vis); clearInterval(t); };
  }, [userId, doSync]);
  useEffect(() => { if (online && userId) doSync(userId); }, [online, userId, doSync]);

  const pushSoon = useRef<number | null>(null);
  const scheduleSync = useCallback(() => {
    if (pushSoon.current) clearTimeout(pushSoon.current);
    pushSoon.current = window.setTimeout(() => { if (userId) doSync(userId); }, 1500);
  }, [userId, doSync]);

  const makeEvent = (kind: EventKind, payload: Record<string, unknown> = {}, xp = 0): ProgressEvent => ({
    id: uuid(), kind, occurred_at: new Date().toISOString(), local_date: localDate(), xp: Math.max(0, Math.min(60, Math.round(xp))), payload, synced: 0,
  });
  const record = useCallback(async (kind: EventKind, payload: Record<string, unknown> = {}, xp = 0) => {
    const e = makeEvent(kind, payload, xp);
    await evStore.put(e);
    setEvents((list) => [...list, e]);
    scheduleSync();
    return e;
  }, [scheduleSync]);
  const recordMany = useCallback(async (list: Array<{ kind: EventKind; payload?: Record<string, unknown>; xp?: number }>) => {
    const made = list.map((x) => makeEvent(x.kind, x.payload, x.xp));
    for (const e of made) await evStore.put(e);
    setEvents((cur) => [...cur, ...made]);
    scheduleSync();
  }, [scheduleSync]);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!userId) return;
    setProfile((p) => (p ? { ...p, ...patch } : p));
    const cur = (await kv.get<Profile>('profile'))!;
    await kv.set('profile', { ...cur, ...patch });
    const pending = (await kv.get<Partial<Profile>>('profilePending')) ?? {};
    await kv.set('profilePending', { ...pending, ...patch });
    scheduleSync();
  }, [userId, scheduleSync]);

  const setPrefs = useCallback(async (patch: Partial<Prefs>) => {
    const at = new Date().toISOString();
    let next: Prefs = {};
    setProfile((p) => { if (!p) return p; next = { ...p.prefs, ...patch }; return { ...p, prefs: next, prefs_updated_at: at }; });
    const cur = await kv.get<Profile>('profile');
    if (cur) { next = { ...cur.prefs, ...patch }; await kv.set('profile', { ...cur, prefs: next, prefs_updated_at: at }); }
    await kv.set('prefsLocal', { prefs: next, at });
    scheduleSync();
  }, [scheduleSync]);

  const roadmapRef = useRef(roadmap);
  roadmapRef.current = roadmap;
  const saveStep = useCallback(async (key: string, patch: Partial<RoadmapStep>) => {
    const base: RoadmapStep = roadmapRef.current[key] ?? { step_key: key, status: 'not_started', started_on: null, done_on: null, notes: '', data: {}, updated_at: '' };
    const step: RoadmapStep = { ...base, ...patch, data: { ...base.data, ...(patch.data ?? {}) }, updated_at: new Date().toISOString(), dirty: 1 };
    roadmapRef.current = { ...roadmapRef.current, [key]: step };
    setRoadmap(roadmapRef.current);
    await rmStore.put(step);
    scheduleSync();
  }, [scheduleSync]);

  const signOut = useCallback(async () => {
    if (userId && navigator.onLine) await doSync(userId).catch(() => undefined);
    await auth.signOut();
    setSession(null);
  }, [userId, doSync]);

  const today = localDate();
  const derived = useMemo(() => derive(events, { today, now: Date.now(), dailyGoal: profile?.daily_goal ?? 20, content }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, today, profile?.daily_goal, content, tick]);

  const prefs = profile?.prefs ?? {};
  const value: Store = {
    ready, session, profile, content, events, derived, roadmap, online, syncing, lastSync, syncError, prefs,
    isStaff: profile?.role === 'admin' || profile?.role === 'reviewer',
    record, recordMany, updateProfile, setPrefs, saveStep, sync, reloadContent, signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { ROADMAP_STEPS };
