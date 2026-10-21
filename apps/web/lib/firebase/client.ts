"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { firebaseConfig } from "./config";

let auth: Auth | null = null;

export function clientApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

export function clientAuth(): Auth {
  if (!auth) {
    auth = getAuth(clientApp());
    auth.languageCode = "sv";
    void setPersistence(auth, browserLocalPersistence);
  }
  return auth;
}
