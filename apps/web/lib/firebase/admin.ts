import "server-only";
import { type App, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { BUCKET } from "@/lib/media/urls";

export const PROJECT_ID = "nackswinget-af7ef";

// On App Hosting the runtime service account provides Application Default
// Credentials; no keys are stored anywhere.
function app(): App {
  return getApps()[0] ?? initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
}

// Next bundles server code into several module instances (RSC, route
// handlers, server actions) that share firebase-admin's single Firestore.
// settings() may only be called once per process, so remember it globally.
const globalForDb = globalThis as typeof globalThis & { __nswDb?: Firestore };

export function getDb(): Firestore {
  if (!globalForDb.__nswDb) {
    const db = getFirestore(app());
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Already configured by another module instance.
    }
    globalForDb.__nswDb = db;
  }
  return globalForDb.__nswDb;
}

export function getBucket() {
  return getStorage(app()).bucket(BUCKET);
}

export function getAdminAuth() {
  return getAuth(app());
}
