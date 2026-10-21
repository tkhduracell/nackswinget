"use client";

import { useState } from "react";

/** Thumbnail + play button; the YouTube player only loads when clicked. */
export function YouTube({ id, title }: { id: string; title?: string }) {
  const [playing, setPlaying] = useState(false);
  const label = title || "YouTube-video";
  if (playing) {
    return (
      <div className="embed embed-16-9">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={label}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <button type="button" className="embed embed-16-9 yt-facade" onClick={() => setPlaying(true)} aria-label={`Spela: ${label}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static YouTube thumbnail */}
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" />
      <span className="yt-play" aria-hidden="true" />
    </button>
  );
}
