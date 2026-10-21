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
      await sendSignInLinkToEmail(clientAuth(), email.trim(), { url: `${window.location.origin}/admin/`, handleCodeInApp: true });
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
          En inloggningslänk har skickats till <strong>{email}</strong>. Öppna den på den här enheten.
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
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const auth = clientAuth();
    // Returning from the email link.
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const email = window.localStorage.getItem(EMAIL_KEY) ?? window.prompt("Bekräfta din e-postadress") ?? "";
      signInWithEmailLink(auth, email, window.location.href)
        .then(() => {
          window.localStorage.removeItem(EMAIL_KEY);
          window.history.replaceState(null, "", "/admin/");
        })
        .catch(() => setError("Länken är ogiltig eller har gått ut. Begär en ny."));
    }
    return onIdTokenChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    callApi<Me>(user, "/me")
      .then((m) => !cancelled && setMe(m))
      .catch((e: ApiError) => {
        if (cancelled) return;
        setError(e.message);
        setMe(null);
      });
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

  if (user === undefined || (user && !me && !error)) return <p className="admin-loading">Laddar…</p>;
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
