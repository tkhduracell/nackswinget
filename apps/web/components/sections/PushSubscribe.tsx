"use client";

import { useCallback, useEffect, useState } from "react";
import { firebaseConfig, NOTIFICATIONS_API, VAPID_KEY } from "@/lib/firebase/config";

const TOPIC = "calendar-337667"; // Friträning
const STORAGE_KEY = "nsw-push-subscribed";

type State = "checking" | "unsupported" | "denied" | "idle" | "subscribed" | "working" | "error";

async function getPushToken(): Promise<string> {
  // Loaded on demand so other pages never ship the Firebase SDK.
  const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  // Deprecated in favour of Installation-ID messaging, but functions/notifications-api
  // subscribes FCM registration tokens to topics, so this must stay token-based.
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
}

function readFlag(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode: state just isn't remembered
  }
}

/** Opt-in push notifications for new Friträning slots (replaces the old Vue widget). */
export function PushSubscribe() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) return setState("unsupported");
      const { isSupported } = await import("firebase/messaging");
      if (!(await isSupported())) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      setState(readFlag() && Notification.permission === "granted" ? "subscribed" : "idle");
    })().catch(() => setState("unsupported"));
  }, []);

  const toggle = useCallback(async (subscribe: boolean) => {
    setState("working");
    try {
      if (subscribe && (await Notification.requestPermission()) !== "granted") return setState("denied");
      const token = await getPushToken();
      const q = new URLSearchParams({ token, topic: TOPIC });
      const res = await fetch(`${NOTIFICATIONS_API}/${subscribe ? "subscribe" : "unsubscribe"}?${q}`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      writeFlag(subscribe);
      setState(subscribe ? "subscribed" : "idle");
    } catch {
      setState("error");
    }
  }, []);

  return (
    <div className="box boxLeft push">
      <h2>Notiser om nya friträningar</h2>
      {state === "checking" && <p className="muted">Kontrollerar stöd för notiser…</p>}
      {state === "unsupported" && (
        <p>Din webbläsare stödjer inte notiser. På iPhone: lägg till sidan på hemskärmen först, eller använd Nackswinget-appen.</p>
      )}
      {state === "denied" && <p>Notiser är blockerade för den här sidan. Ändra det i webbläsarens inställningar.</p>}
      {state === "idle" && (
        <>
          <p>Få en notis när nya friträningstider läggs upp.</p>
          <button type="button" className="button" onClick={() => toggle(true)}>
            Bevaka friträningar
          </button>
        </>
      )}
      {state === "subscribed" && (
        <>
          <p>Du bevakar nya friträningar på den här enheten.</p>
          <button type="button" className="button button-ghost" onClick={() => toggle(false)}>
            Sluta bevaka
          </button>
        </>
      )}
      {state === "working" && <p className="muted">Ett ögonblick…</p>}
      {state === "error" && (
        <>
          <p>Något gick fel. Försök igen.</p>
          <button type="button" className="button" onClick={() => toggle(true)}>
            Försök igen
          </button>
        </>
      )}
    </div>
  );
}
