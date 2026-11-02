"use client";

// A minimal IndexedDB-backed outbox for the one offline-critical write in
// this app: a volunteer's field verification. No dependency pulled in —
// the native API is verbose but this is the only thing we need it for.
const DB_NAME = "maatram-offline";
const STORE_NAME = "verification-queue";
const DB_VERSION = 1;

export type QueuedVerification = {
  id: number;
  applicantId: string;
  fields: Record<string, string>;
  queuedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueVerification(applicantId: string, fields: Record<string, string>) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ applicantId, fields, queuedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueuedVerifications(): Promise<QueuedVerification[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueuedVerification[]);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueuedVerification(id: number) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Flushes every queued submission to the server, oldest first. A
 * submission that fails (still offline, or a real validation error) stays
 * queued and stops the flush — we don't want a later item to post out of
 * order ahead of an earlier one for the same applicant. */
export async function flushQueuedVerifications(): Promise<{ synced: number; remaining: number }> {
  const items = await listQueuedVerifications();
  let synced = 0;
  for (const item of items) {
    const body = new FormData();
    body.set("applicantId", item.applicantId);
    for (const [k, v] of Object.entries(item.fields)) body.set(k, v);

    try {
      const res = await fetch("/api/offline/verification", { method: "POST", body });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !json.ok) break;
      await removeQueuedVerification(item.id);
      synced++;
    } catch {
      break; // still offline — stop, leave the rest queued
    }
  }
  const remaining = (await listQueuedVerifications()).length;
  return { synced, remaining };
}
