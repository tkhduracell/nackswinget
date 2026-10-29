import type { PlayerBlock } from "./types";

// The Storbild playback loop, in plain DOM so it can run on the TV and in the
// admin preview alike. Each block is a full-screen layer. The next block is
// built hidden while the current one plays, and switching is a CSS crossfade
// (opacity on `.on`). Blocks advance on their own: videos when they end (or
// at their duration, if set), everything else at its duration.

export const FADE_MS = 600;
const READY_TIMEOUT_MS = 10_000;
const FRAME_SHOW_AFTER_MS = 8_000;

/**
 * Whether `next` may be built while `current` is on screen. Light mode
 * (Pi Zero 2 W, 512 MB) never has two videos loaded at once: a video after a
 * video is built only once the first is gone, so the switch fades through black.
 */
export function canPreload(light: boolean, current: PlayerBlock | undefined, next: PlayerBlock): boolean {
  return !(light && current?.kind === "video" && next.kind === "video");
}

export interface EngineEvents {
  /** A block is now on screen. */
  onShow?(block: PlayerBlock, index: number): void;
  /** A block couldn't load or play and was skipped. */
  onError?(block: PlayerBlock, reason: string): void;
}

interface Layer {
  block: PlayerBlock;
  el: HTMLElement;
  media?: HTMLVideoElement | HTMLImageElement | HTMLIFrameElement;
  ready: Promise<string | null>;
}

export class Engine {
  private blocks: PlayerBlock[] = [];
  private current: Layer | null = null;
  private pending: Layer | null = null;
  private index = -1;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private stopped = false;
  private loading = false;
  private prepTimer: ReturnType<typeof setTimeout> | undefined;
  /** See canPreload(). Takes effect from the next switch. */
  light = false;

  constructor(
    private root: HTMLElement,
    private events: EngineEvents = {},
  ) {}

  /**
   * Replaces the playlist. The block on screen keeps playing; playback goes
   * on with the block after it (by id) in the new list, or from the start.
   * `resumeId` starts at that block when nothing is playing yet.
   */
  setBlocks(blocks: PlayerBlock[], resumeId?: string) {
    this.blocks = blocks;
    // The same block with new text or settings (typing in the editor) changes in place, without reloading.
    const now = this.current && blocks.find((b) => sameContent(b, this.current!.block));
    if (now) this.patch(this.current!, now);
    const anchor = this.current?.block.id ?? resumeId;
    // "Senaste nyheterna" expands into ids like "block:post"; the block id alone matches its first screen.
    const at = anchor ? blocks.findIndex((b) => b.id === anchor || b.id.startsWith(`${anchor}:`)) : -1;
    if (this.current) {
      this.index = at;
      if (!blocks.length) {
        this.discardPending();
        return this.clear();
      }
      const next = blocks[this.nextIndex()];
      if (this.pending && sameContent(this.pending.block, next)) this.patch(this.pending, next);
      else this.prepareNext();
    } else if (blocks.length) {
      this.discardPending();
      // A resumed block plays again from its start rather than being skipped.
      this.index = at >= 0 ? at - 1 : -1;
      void this.advance();
    }
  }

  /** Position for resuming after a reload: the block on screen and its playback time. */
  position(): { id: string; t: number } | null {
    if (!this.current) return null;
    const media = this.current.media;
    return { id: this.current.block.id, t: media instanceof HTMLVideoElement ? media.currentTime : 0 };
  }

  destroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.prepTimer);
    this.discardPending();
    if (this.current) this.dispose(this.current);
    this.current = null;
  }

  private nextIndex(): number {
    return (this.index + 1) % this.blocks.length;
  }

  private build(block: PlayerBlock): Layer {
    const el = document.createElement("div");
    el.className = "bs-layer";
    let media: Layer["media"];
    let ready: Promise<string | null>;
    if (block.kind === "video") {
      const v = document.createElement("video");
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.preload = "auto";
      if (block.poster) v.poster = block.poster;
      v.src = block.src;
      media = v;
      ready = waitFor(v, "canplay", () => v.readyState >= 3);
    } else if (block.kind === "image") {
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.src = block.src;
      img.style.objectFit = block.fit ?? "cover";
      if (block.background) el.style.background = block.background;
      media = img;
      ready = waitFor(img, "load", () => img.complete && img.naturalWidth > 0).then((err) => err ?? img.decode().then(() => null, () => null));
    } else if (block.kind === "text") {
      const t = document.createElement("div");
      t.className = "bs-text";
      if (block.background) t.style.background = block.background;
      const h = document.createElement("h2");
      h.textContent = block.title ?? "";
      t.appendChild(h);
      if (block.body) {
        const p = document.createElement("p");
        p.textContent = block.body;
        t.appendChild(p);
      }
      el.appendChild(t);
      ready = Promise.resolve(null);
    } else if (block.kind === "html") {
      const h = document.createElement("div");
      h.className = "bs-html";
      h.innerHTML = block.html ?? "";
      setClocks(h);
      el.appendChild(h);
      // Shown once its pictures are in; a missing picture doesn't skip the block.
      ready = Promise.all([...h.querySelectorAll("img")].map((img) => waitFor(img, "load", () => img.complete))).then(() => null);
    } else {
      const f = document.createElement("iframe");
      f.src = block.src;
      f.setAttribute("scrolling", "no");
      f.setAttribute("tabindex", "-1");
      media = f;
      // A page is never skipped for being slow: on a Pi Zero a full page can take
      // well over READY_TIMEOUT_MS to fire "load". Show it when it loads, or after
      // FRAME_SHOW_AFTER_MS with whatever has rendered by then.
      ready = new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), FRAME_SHOW_AFTER_MS);
        f.addEventListener("load", () => (clearTimeout(t), resolve(null)), { once: true });
      });
    }
    if (media) el.appendChild(media);
    this.root.appendChild(el);
    const layer = { block, el, media, ready };
    this.setCaption(layer, block.caption);
    return layer;
  }

  private setCaption(layer: Layer, caption: string | undefined) {
    let cap = layer.el.querySelector<HTMLElement>(".bs-caption");
    if (!caption) return cap?.remove();
    if (!cap) {
      cap = document.createElement("div");
      cap.className = "bs-caption";
      layer.el.appendChild(cap);
    }
    cap.textContent = caption;
  }

  /** Applies a block's new text and settings to a layer that shows the same content. */
  private patch(layer: Layer, block: PlayerBlock) {
    layer.block = block;
    this.setCaption(layer, block.caption);
    if (layer.media instanceof HTMLImageElement) {
      layer.media.style.objectFit = block.fit ?? "cover";
      layer.el.style.background = block.background ?? "";
    }
    const text = layer.el.querySelector<HTMLElement>(".bs-text");
    if (text) {
      text.style.background = block.background ?? "";
      text.querySelector("h2")!.textContent = block.title ?? "";
      let p = text.querySelector("p");
      if (!block.body) p?.remove();
      else {
        if (!p) p = text.appendChild(document.createElement("p"));
        p.textContent = block.body;
      }
    }
  }

  private prepare(i: number) {
    this.discardPending();
    this.pending = this.build(this.blocks[i]);
  }

  /** Builds the block after the current one, unless light mode says to wait. */
  private prepareNext() {
    clearTimeout(this.prepTimer);
    const i = this.nextIndex();
    if (!canPreload(this.light, this.current?.block, this.blocks[i])) return this.discardPending();
    // Light mode: wait until the previous layer has faded out and been freed,
    // so a fading video and a preloading one never overlap.
    if (this.light && this.blocks[i].kind === "video") {
      this.discardPending();
      this.prepTimer = setTimeout(() => this.nextIndex() === i && !this.loading && this.prepare(i), FADE_MS + 100);
      return;
    }
    this.prepare(i);
  }

  /** Fades the current layer out and frees it (light mode, before loading the next video). */
  private async fadeOutCurrent() {
    const old = this.current;
    if (!old) return;
    this.current = null;
    old.el.classList.remove("on");
    await new Promise((r) => setTimeout(r, FADE_MS));
    this.dispose(old);
  }

  private discardPending() {
    if (this.pending) this.dispose(this.pending);
    this.pending = null;
  }

  private dispose(layer: Layer) {
    const m = layer.media;
    if (m instanceof HTMLVideoElement) {
      // Frees the decoder right away instead of at garbage collection.
      m.pause();
      m.removeAttribute("src");
      m.load();
    }
    layer.el.remove();
  }

  private clear() {
    clearTimeout(this.timer);
    if (this.current) {
      const old = this.current;
      old.el.classList.remove("on");
      setTimeout(() => this.dispose(old), FADE_MS + 50);
    }
    this.current = null;
    this.index = -1;
  }

  /** One switch at a time: timers, `ended` and new playlists may all ask while a block loads. */
  private async advance(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    let again = false;
    try {
      again = await this.step();
    } finally {
      this.loading = false;
    }
    if (again) return this.advance();
  }

  /** Shows the next block. Returns true to try again right away (the playlist changed meanwhile). */
  private async step(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.stopped || !this.blocks.length) return false;
    let i = this.nextIndex();
    if (!this.pending || this.pending.block !== this.blocks[i]) {
      if (!canPreload(this.light, this.current?.block, this.blocks[i])) {
        await this.fadeOutCurrent();
        if (this.stopped || !this.blocks.length) return false;
        // A new playlist may have arrived during the fade.
        i = this.nextIndex();
      }
      this.prepare(i);
    }
    const layer = this.pending!;
    this.pending = null;
    const err = await layer.ready;
    if (this.stopped) {
      this.dispose(layer);
      return false;
    }
    if (this.blocks[i] !== layer.block) {
      // The playlist changed while this block loaded.
      this.dispose(layer);
      return true;
    }
    this.index = i;
    let failed = err;
    if (!failed && layer.media instanceof HTMLVideoElement) {
      try {
        await layer.media.play();
      } catch (e) {
        failed = (e as Error).message || "play() failed";
      }
    }
    if (failed) {
      this.events.onError?.(layer.block, failed);
      this.dispose(layer);
      // Everything failing in a row: wait before trying the loop again.
      this.failures++;
      this.timer = setTimeout(() => void this.advance(), this.failures >= this.blocks.length ? 15_000 : 0);
      return false;
    }
    this.failures = 0;
    this.swapTo(layer);
    this.events.onShow?.(layer.block, i);
    this.schedule(layer);
    this.prepareNext();
    return false;
  }

  private swapTo(layer: Layer) {
    const old = this.current;
    this.current = layer;
    // The layer was built ahead of time; its clock is set again as it comes on screen.
    setClocks(layer.el);
    requestAnimationFrame(() => layer.el.classList.add("on"));
    if (old) {
      old.el.classList.remove("on");
      setTimeout(() => this.dispose(old), FADE_MS + 50);
    }
  }

  private schedule(layer: Layer) {
    const { block, media } = layer;
    const next = () => void this.advance();
    if (media instanceof HTMLVideoElement) {
      media.addEventListener("ended", () => this.current === layer && next(), { once: true });
      const length = Number.isFinite(media.duration) ? media.duration : null;
      // A stalled video must not hold the screen forever.
      const cap = block.durationSec ?? (length ? length + 5 : 600);
      this.timer = setTimeout(next, cap * 1000);
      const shown = Math.min(block.durationSec ?? Infinity, length ?? Infinity);
      if (Number.isFinite(shown)) this.progress(layer, shown);
    } else {
      // A playlist of one image crossfades into itself, which looks like nothing happened.
      const shown = block.durationSec ?? 10;
      this.timer = setTimeout(next, shown * 1000);
      this.progress(layer, shown);
    }
  }

  /** The red line along the bottom that fills over the time the block is on screen. */
  private progress(layer: Layer, seconds: number, from = 0) {
    let bar = layer.el.querySelector<HTMLElement>(".bs-progress");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "bs-progress";
      layer.el.appendChild(bar);
    }
    // A negative delay starts the fill part-way (resume after reload).
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = `bs-progress ${seconds}s linear ${-from}s forwards`;
  }

  /** Seeks the video on screen (resume after reload). */
  seek(t: number) {
    const layer = this.current;
    const m = layer?.media;
    if (!layer || !(m instanceof HTMLVideoElement) || !Number.isFinite(m.duration)) return;
    const end = Math.min(m.duration, layer.block.durationSec ?? Infinity);
    if (t >= end - 2) return;
    m.currentTime = t;
    this.progress(layer, end, t);
    if (layer.block.durationSec) {
      // The duration counts from the start of the clip, not from the resume point.
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.advance(), (end - t) * 1000);
    }
  }
}

/** Resolves null when `event` fires (or `already()` is true), else an error message. */
function waitFor(el: HTMLElement, event: string, already: () => boolean): Promise<string | null> {
  if (already()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), READY_TIMEOUT_MS);
    el.addEventListener(event, () => (clearTimeout(timer), resolve(null)), { once: true });
    el.addEventListener("error", () => (clearTimeout(timer), resolve("load error")), { once: true });
  });
}

const clock = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });

/** Fills in the time (HH:MM, Stockholm) wherever server markup asks for it. */
function setClocks(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>("[data-bs-clock]")) el.textContent = clock.format(new Date());
}

/** Same block showing the same file, page or markup, so a layer can be updated instead of rebuilt. */
function sameContent(a: PlayerBlock, b: PlayerBlock): boolean {
  return a.id === b.id && a.kind === b.kind && a.src === b.src && a.html === b.html;
}
