import { Suspense, lazy, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { CONFIGURED } from './config/env';
import { auth, friendly } from './lib/api';
import { useStore } from './state/store';
import { AccessRemoved, LinkExpired, NotConfigured, SetPassword, SignIn, Unsubscribe } from './screens/auth/Auth';
import { Onboarding } from './screens/onboarding/Onboarding';
import { Home } from './screens/student/Home';
import { LessonScreen, PlacementScreen, PracticeScreen } from './screens/student/Study';
import { RoadmapScreen } from './screens/student/Roadmap';
import { Glossary, Leaderboard, Settings, Stats } from './screens/student/More';
import { ExamHome, ExamResults, ExamRunner } from './screens/exam/Exam';
import { Loading, ToastHost, Wordmark } from './ui/common';
import * as I from './ui/icons';
import { Link, match, navigate, useLocation } from './ui/router';

const AdminRoutes = lazy(() => import('./screens/admin/Admin').then((m) => ({ default: m.AdminRoutes })));

// Read auth hints before the Supabase client clears the URL.
const initialHash = new URLSearchParams(location.hash.slice(1));
const initialQuery = new URLSearchParams(location.search);
const linkError = initialHash.get('error_code') || initialQuery.get('error_code');

function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update().catch(() => undefined), 30 * 60 * 1000); },
  });
  if (!needRefresh) return null;
  return (
    <div className="toast" role="alert" style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}>
      <span>New version available. Tap to update.</span>
      <button onClick={() => {
        // Reload as soon as the new version takes over (with a fallback).
        navigator.serviceWorker?.addEventListener('controllerchange', () => location.reload(), { once: true });
        setTimeout(() => location.reload(), 4000);
        updateServiceWorker(true);
      }}>Update</button>
    </div>
  );
}

function useTheme() {
  const { prefs } = useStore();
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme && prefs.theme !== 'system') root.dataset.theme = prefs.theme; else delete root.dataset.theme;
    root.dataset.text = prefs.textSize ?? 'md';
    const dark = prefs.theme === 'dark' || ((prefs.theme ?? 'system') === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#FFFFFF');
  }, [prefs.theme, prefs.textSize]);
}

function TopBar() {
  const { derived, profile, online, isStaff, prefs } = useStore();
  const goalHit = derived.xpToday >= (profile?.daily_goal ?? 20);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" aria-label="YPFG Academy home" style={{ textDecoration: 'none' }}><Wordmark size={22} /></Link>
        {!online && <span className="offline-pill" role="status">Offline</span>}
        <span className="grow" />
        <div className="hud">
          <Link to="/stats" className={`hud-item ${derived.streak ? '' : 'dim'}`} aria-label={`${derived.streak}-day streak${derived.studiedToday ? '' : ', not yet extended today'}${derived.freezeHeld ? ', streak freeze ready' : ''}`}>
            <I.Flame size={22} /> {derived.streak}{derived.freezeHeld && <I.Snow size={14} />}
          </Link>
          <Link to="/stats" className={`hud-item ${goalHit ? '' : 'dim'}`} aria-label={`${derived.xpToday} XP today`}><I.Bolt size={22} /> {derived.xpToday}</Link>
          {!prefs.heartsUnlimited && <span className="hud-item" aria-label={`${derived.hearts} hearts`}><I.HeartFill size={20} /> {derived.hearts}</span>}
          <Link to="/glossary" className="icon-btn" aria-label="Glossary"><I.Book /></Link>
          {isStaff && <Link to="/admin" className="icon-btn" aria-label="Admin and review tools"><I.Shield /></Link>}
        </div>
      </div>
    </header>
  );
}

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      <Link to="/"><I.Home /> Learn</Link>
      <Link to="/roadmap"><I.Map /> Roadmap</Link>
      <Link to="/exam"><I.Clock /> Exam Day</Link>
      <Link to="/stats"><I.Chart /> Stats</Link>
      <Link to="/settings"><I.Gear /> Settings</Link>
    </nav>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="app">
      <a href="#main" className="sr-only">Skip to content</a>
      <TopBar />
      <div className={wide ? 'wide-wrap' : undefined}>{children}</div>
      <TabBar />
    </div>
  );
}

export default function App() {
  const store = useStore();
  const { path, query } = useLocation();
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState('');
  useTheme();

  // Email links that carry a token_hash (our custom email templates).
  useEffect(() => {
    const th = initialQuery.get('token_hash'), type = initialQuery.get('type') as 'invite' | 'recovery' | null;
    if (th && type && !store.session) {
      setVerifying(true);
      auth.verifyToken(th, type).catch((e) => setVerifyErr(friendly(e))).finally(() => setVerifying(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!CONFIGURED) return <NotConfigured />;
  if (path === '/unsubscribe') return <Unsubscribe token={query.get('token') ?? ''} />;
  if (linkError || verifyErr) return <LinkExpired />;
  if (verifying) return <Loading />;
  if (!store.session) return store.ready ? <><SignIn /><UpdatePrompt /><ToastHost /></> : <Loading />;
  if (path === '/set-password') return <SetPassword mode={query.get('mode') === 'reset' ? 'reset' : 'invite'} />;
  if (!store.profile || !store.content) {
    return <>{store.syncError ? <div className="splash"><Wordmark size={30} /><p>{store.syncError}</p><button className="btn" onClick={store.sync}>Try again</button><button className="btn quiet" onClick={store.signOut}>Sign out</button></div> : <Loading text="Getting your lessons ready…" />}<UpdatePrompt /></>;
  }
  if (store.profile.disabled) return <AccessRemoved onSignOut={store.signOut} />;
  if (!store.profile.onboarded_at && !path.startsWith('/placement/')) return <><Onboarding /><UpdatePrompt /></>;

  let m: Record<string, string> | null;
  let screen: React.ReactNode;
  let chrome = true;
  if ((m = match('/lesson/:id', path))) { screen = <LessonScreen lessonId={m.id} key={m.id} />; chrome = false; }
  else if (path === '/practice') { screen = <PracticeScreen key={location.search} />; chrome = false; }
  else if ((m = match('/placement/:unit', path))) { screen = <PlacementScreen unitId={m.unit} key={m.unit} />; chrome = false; }
  else if ((m = match('/exam/session/:id', path))) { screen = <ExamRunner sessionId={m.id} />; chrome = false; }
  else if ((m = match('/exam/results/:id', path))) screen = <ExamResults sessionId={m.id} mode="results" />;
  else if ((m = match('/exam/review/:id', path))) screen = <ExamResults sessionId={m.id} mode="review" />;
  else if (path === '/exam') screen = <ExamHome />;
  else if (path === '/roadmap') screen = <RoadmapScreen />;
  else if (path === '/glossary') screen = <Glossary />;
  else if (path === '/leaderboard') screen = <Leaderboard />;
  else if (path === '/stats') screen = <Stats />;
  else if (path === '/settings') screen = <Settings />;
  else if (path.startsWith('/admin')) screen = store.isStaff ? <Suspense fallback={<main className="page"><p className="muted">Loading…</p></main>}><AdminRoutes path={path} /></Suspense> : <NotFound />;
  else if (path === '/' || path === '/index.html') screen = <Home />;
  else screen = <NotFound />;

  return (
    <>
      {chrome ? <Shell>{screen}</Shell> : screen}
      <UpdatePrompt />
      <ToastHost />
    </>
  );
}

function NotFound() {
  return (
    <main className="page center stack" style={{ alignItems: 'center', paddingTop: '3rem' }}>
      <h1>Nothing here.</h1>
      <p className="muted">That page doesn't exist, or you don't have access to it.</p>
      <button className="btn" onClick={() => navigate('/')}>Go home</button>
    </main>
  );
}
