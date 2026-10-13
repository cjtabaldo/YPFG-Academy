// On-device storage (IndexedDB). Lessons, content and progress live here so
// the app works offline; the sync engine copies changes to and from the server.
import { openDB, type IDBPDatabase } from 'idb';
import type { ProgressEvent, RoadmapStep } from './types';

let dbp: Promise<IDBPDatabase> | null = null;
let userKey = 'anon';

export function openUserDb(userId: string) { userKey = userId; dbp = null; }

function db() {
  if (!dbp) {
    dbp = openDB(`ypfg-${userKey}`, 1, {
      upgrade(d) {
        d.createObjectStore('kv');
        const ev = d.createObjectStore('events', { keyPath: 'id' });
        ev.createIndex('synced', 'synced');
        d.createObjectStore('roadmap', { keyPath: 'step_key' });
        d.createObjectStore('outbox', { keyPath: 'id' });
      },
    });
  }
  return dbp;
}

export const kv = {
  get: async <T>(k: string) => (await db()).get('kv', k) as Promise<T | undefined>,
  set: async (k: string, v: unknown) => { await (await db()).put('kv', v, k); },
  del: async (k: string) => { await (await db()).delete('kv', k); },
};

export const events = {
  all: async () => (await db()).getAll('events') as Promise<ProgressEvent[]>,
  put: async (e: ProgressEvent) => { await (await db()).put('events', e); },
  putMany: async (list: ProgressEvent[]) => {
    const tx = (await db()).transaction('events', 'readwrite');
    for (const e of list) {
      const cur = await tx.store.get(e.id);
      if (!cur || !cur.synced) await tx.store.put({ ...e, synced: 1 });
    }
    await tx.done;
  },
  unsynced: async () => (await db()).getAllFromIndex('events', 'synced', 0) as Promise<ProgressEvent[]>,
  markSynced: async (ids: string[]) => {
    const tx = (await db()).transaction('events', 'readwrite');
    for (const id of ids) { const e = await tx.store.get(id); if (e) await tx.store.put({ ...e, synced: 1 }); }
    await tx.done;
  },
};

export const roadmap = {
  all: async () => (await db()).getAll('roadmap') as Promise<RoadmapStep[]>,
  put: async (s: RoadmapStep) => { await (await db()).put('roadmap', s); },
};

// Generic queue for writes that must reach the server (exam answers, flags).
export interface OutboxItem { id: string; type: string; body: unknown; at: string }
export const outbox = {
  all: async () => (await db()).getAll('outbox') as Promise<OutboxItem[]>,
  add: async (item: OutboxItem) => { await (await db()).put('outbox', item); },
  remove: async (id: string) => { await (await db()).delete('outbox', id); },
};
