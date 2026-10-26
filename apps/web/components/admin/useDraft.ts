import { useCallback, useEffect, useRef, useState } from "react";
import { useAdmin } from "./AuthProvider";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface Loaded<T> {
  published: (T & { id: string }) | null;
  draft: T | null;
  draftMeta: { updatedAt: string; updatedBy: string } | null;
}

/**
 * Loads a page/post (draft if there is one), autosaves edits as a draft
 * every few seconds, and publishes on demand.
 */
export function useDraft<T extends { id: string }>(kind: "pages" | "posts", id: string, blank: () => T) {
  const { api } = useAdmin();
  const [doc, setDoc] = useState<T | null>(null);
  const [published, setPublished] = useState<T | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const pending = useRef<T | null>(null);
  const blankRef = useRef(blank);

  useEffect(() => {
    let cancelled = false;
    api<Loaded<T>>(`/docs/${kind}/${id}`)
      .then((res) => {
        if (cancelled) return;
        setPublished(res.published);
        setHasDraft(!!res.draft);
        setDoc(res.draft ?? res.published ?? blankRef.current());
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [api, kind, id]);

  const update = useCallback((next: T) => {
    setDoc(next);
    pending.current = next;
    setState("dirty");
  }, []);

  // Autosave.
  useEffect(() => {
    if (state !== "dirty") return;
    const t = setTimeout(async () => {
      const toSave = pending.current;
      if (!toSave) return;
      setState("saving");
      try {
        await api(`/docs/${kind}/${id}`, { method: "PUT", json: toSave });
        setHasDraft(true);
        setError(null);
        setState(pending.current === toSave ? "saved" : "dirty");
      } catch (e) {
        setError((e as Error).message);
        setState("error");
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [state, api, kind, id]);

  /** Publishes `next` (e.g. with a generated slug) or the current doc. */
  const publish = useCallback(async (next?: T) => {
    const toPublish = next ?? doc;
    if (!toPublish) return null;
    if (next) setDoc(next);
    setState("saving");
    const editsBefore = pending.current;
    try {
      const saved = await api<T>(`/docs/${kind}/${id}`, { method: "POST", json: toPublish });
      // The server may fill fields in (an AI SEO title); show them unless the editor typed meanwhile.
      if (pending.current === editsBefore) setDoc(saved);
      pending.current = null;
      setPublished(saved);
      setHasDraft(false);
      setError(null);
      setState("saved");
      return saved;
    } catch (e) {
      setError((e as Error).message);
      setState("error");
      return null;
    }
  }, [api, doc, kind, id]);

  const discard = useCallback(async () => {
    await api(`/docs/${kind}/${id}?draft=1`, { method: "DELETE" });
    pending.current = null;
    setHasDraft(false);
    setDoc(published ?? blankRef.current());
    setState("idle");
  }, [api, kind, id, published]);

  return { doc, update, published, publish, discard, state, error, hasDraft };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/å|ä/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
