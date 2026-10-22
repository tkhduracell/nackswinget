"use client";

import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from "firebase/auth";
import { authConfig, USE_EMULATORS } from "./config";

let auth: Auth | null = null;

// A named app so it never collides with the push widget's default app.
const ADMIN_APP = "nsw-admin";

export function clientApp(): FirebaseApp {
  return getApps().some((a) => a.name === ADMIN_APP) ? getApp(ADMIN_APP) : initializeApp(authConfig, ADMIN_APP);
}

export function clientAuth(): Auth {
  if (!auth) {
    auth = getAuth(clientApp());
    if (USE_EMULATORS) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    auth.languageCode = "sv";
    void setPersistence(auth, browserLocalPersistence);
  }
  return auth;
}
