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

/** Flushes every queued submission to the server, oldest first within each
 * applicant (so a later visit never posts ahead of an earlier one for the
 * *same* applicant). A network failure means we're still offline — stop
 * the whole flush immediately, nothing else will succeed either. A
 * server-rejected item (e.g. the applicant moved past verification, or
 * got reassigned, while this was queued) is a *permanent* rejection for
 * that one applicant, not a sign of being offline — skip just that
 * applicant's remaining queued items and keep flushing everyone else's,
 * rather than one stuck item blocking every other visit's sync. */
export async function flushQueuedVerifications(): Promise<{ synced: number; remaining: number }> {
  const items = await listQueuedVerifications();
  const blockedApplicantIds = new Set<string>();
  let synced = 0;

  for (const item of items) {
    if (blockedApplicantIds.has(item.applicantId)) continue;

    const body = new FormData();
    body.set("applicantId", item.applicantId);
    for (const [k, v] of Object.entries(item.fields)) body.set(k, v);

    try {
      const res = await fetch("/api/offline/verification", { method: "POST", body });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !json.ok) {
        blockedApplicantIds.add(item.applicantId);
        continue;
      }
      await removeQueuedVerification(item.id);
      synced++;
    } catch {
      break; // still offline — stop, leave everything (for every applicant) queued
    }
  }
  const remaining = (await listQueuedVerifications()).length;
  return { synced, remaining };
}
