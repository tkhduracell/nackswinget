"use client";

import { isSignInWithEmailLink, onIdTokenChanged, sendSignInLinkToEmail, signInWithEmailLink, signOut, type User } from "firebase/auth";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clientAuth } from "@/lib/firebase/client";

export interface Me {
  uid: string;
  email: string;
  role: "admin" | "editor";
}

interface AuthCtx {
  me: Me;
  api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T>;
  logout(): Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const EMAIL_KEY = "nsw-admin-email";

// An email link can only be used once; React may run effects twice in dev,
// so the sign-in is shared through one module-level promise.
let linkSignIn: Promise<void> | null = null;

export function useAdmin(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdmin outside AuthProvider");
  return ctx;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function callApi<T>(user: User, path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = await user.getIdToken();
  const { json, ...rest } = init;
  // trailingSlash is on: call the canonical "/api/admin/x/?q" form to skip a 308.
  const [pathname, query] = path.split("?");
  const url = `/api/admin${pathname.endsWith("/") ? pathname : `${pathname}/`}${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    ...rest,
    headers: { Authorization: `Bearer ${token}`, ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? `Fel ${res.status}`);
  return body as T;
}

function LoginForm({ error }: { error?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const send = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setState("sending");
    try {
      // The site mails the link itself (direct /admin/ link, Swedish email).
      // Without SMTP configured (503 + fallback) Firebase sends its own email.
      const res = await fetch("/api/admin/login-link/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.status === 503 && (await res.json().catch(() => ({}))).fallback) {
        await sendSignInLinkToEmail(clientAuth(), email.trim(), { url: `${window.location.origin}/admin/`, handleCodeInApp: true });
      } else if (!res.ok) {
        throw new Error(String(res.status));
      }
      window.localStorage.setItem(EMAIL_KEY, email.trim());
      setState("sent");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="admin-login">
      <h1>Nackswinget – administration</h1>
      {error && <p className="admin-error">{error}</p>}
      {state === "sent" ? (
        <p>
          Om <strong>{email}</strong> har behörighet har en inloggningslänk skickats dit. Öppna den i den här webbläsaren.
        </p>
      ) : (
        <form onSubmit={send}>
          <label>
            E-postadress
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="button" disabled={state === "sending"}>
            {state === "sending" ? "Skickar…" : "Skicka inloggningslänk"}
          </button>
          {state === "error" && <p className="admin-error">Kunde inte skicka länken. Kontrollera adressen och försök igen.</p>}
        </form>
      )}
    </div>
  );
}

/** Email-link sign in + allowlist check (server side, /api/admin/me). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  // uid whose /me check has finished (avoids a sync setState in the effect).
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const auth = clientAuth();
    // Returning from the email link.
    if (isSignInWithEmailLink(auth, window.location.href)) {
      linkSignIn ??= (async () => {
        const email = window.localStorage.getItem(EMAIL_KEY) ?? window.prompt("Bekräfta din e-postadress") ?? "";
        await signInWithEmailLink(auth, email, window.location.href);
        window.localStorage.removeItem(EMAIL_KEY);
      })();
      linkSignIn
        .catch(() => {
          // A used link is harmless if we're signed in anyway.
          if (!auth.currentUser) setError("Länken är ogiltig eller har gått ut. Begär en ny.");
        })
        .finally(() => window.history.replaceState(null, "", "/admin/"));
    }
    return onIdTokenChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    callApi<Me>(user, "/me")
      .then((m) => {
        if (cancelled) return;
        setMe(m);
        setError(undefined);
      })
      .catch((e: ApiError) => {
        if (cancelled) return;
        setError(e.message);
        setMe(null);
      })
      .finally(() => !cancelled && setCheckedFor(user.uid));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const logout = useCallback(async () => {
    await signOut(clientAuth());
    setMe(null);
  }, []);

  const value = useMemo<AuthCtx | null>(() => {
    if (!user || !me) return null;
    return { me, api: (path, init) => callApi(user, path, init), logout };
  }, [user, me, logout]);

  const checking = !!user && checkedFor !== user.uid;
  if (user === undefined || (user && !me && (checking || !error))) return <p className="admin-loading">Laddar…</p>;
  if (!user || !value) {
    return (
      <>
        <LoginForm error={user ? error : undefined} />
        {user && (
          <p className="admin-login">
            Inloggad som {user.email}.{" "}
            <button className="link-button" onClick={logout}>
              Logga ut
            </button>
          </p>
        )}
      </>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
