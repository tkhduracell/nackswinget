"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from "firebase/auth";
import { firebaseConfig, USE_EMULATORS } from "./config";

let auth: Auth | null = null;

export function clientApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(firebaseConfig);
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
