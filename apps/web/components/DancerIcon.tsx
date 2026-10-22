"use client";

import { useEffect, useRef } from "react";

// Hand-drawn stick-figure dancer (redraw of the old WordPress PNG). Each limb
// is its own group pivoting at its joint (transform-origin in globals.css,
// "Dancer icon"), so the CSS keyframes can swing it like a jointed puppet.
// The markup is static; this component only toggles `is-dancing`: once when
// the icon first scrolls into view, and again on every hover/focus of its link.

const PLAY_DELAY_MS = 500;

export function DancerIcon({ size = 28 }: { size?: number }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const play = () => {
      svg.classList.remove("is-dancing");
      void svg.getBoundingClientRect(); // flush styles so re-adding the class restarts the animation
      svg.classList.add("is-dancing");
    };
    const stop = (e: AnimationEvent) => {
      if (e.target === svg.firstElementChild) svg.classList.remove("is-dancing");
    };
    const host = svg.closest("a") ?? svg;
    host.addEventListener("mouseenter", play);
    host.addEventListener("focus", play);
    svg.addEventListener("animationend", stop);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      timer = setTimeout(play, PLAY_DELAY_MS);
    });
    io.observe(svg);

    return () => {
      io.disconnect();
      clearTimeout(timer);
      host.removeEventListener("mouseenter", play);
      host.removeEventListener("focus", play);
      svg.removeEventListener("animationend", stop);
    };
  }, []);

  return (
    <svg
      ref={ref}
      className="dancer"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <g className="d-fig">
        <g className="d-leg-l">
          <path d="M22 30 18.5 37" />
          <g className="d-shin-l">
            <path d="M18.5 37 14 44.2h-3" />
          </g>
        </g>
        <g className="d-leg-r">
          <path d="M22 30 29.5 34" />
          <g className="d-shin-r">
            <path d="M29.5 34 28.5 43h3.5" />
          </g>
        </g>
        <g className="d-upper">
          <path d="M24.4 15.4 22 30" />
          <g className="d-head">
            <circle cx="25" cy="10" r="4.6" />
          </g>
          <g className="d-arm-l">
            <path d="M24.1 17 17 14" />
            <g className="d-fore-l">
              <path d="M17 14 10 11.5" />
            </g>
          </g>
          <g className="d-arm-r">
            <path d="M24.1 17 32 18.5" />
            <g className="d-fore-r">
              <path d="M32 18.5 40 16.5" />
            </g>
          </g>
        </g>
      </g>
      <g strokeWidth={1.9}>
        <g className="d-note d-note-1">
          <ellipse cx="11.6" cy="5.4" rx="2.3" ry="1.7" transform="rotate(-20 11.6 5.4)" fill="currentColor" stroke="none" />
          <path d="M13.7 4.8V.6q2.6.6 2.9 3.4" />
        </g>
        <g className="d-note d-note-2">
          <ellipse cx="39.4" cy="10.2" rx="2.3" ry="1.7" transform="rotate(-20 39.4 10.2)" fill="currentColor" stroke="none" />
          <path d="M41.5 9.6V3.1q2.8.6 3.1 3.6" />
        </g>
        <g className="d-note d-note-3">
          <ellipse cx="5.6" cy="31" rx="2.3" ry="1.7" transform="rotate(-20 5.6 31)" fill="currentColor" stroke="none" />
          <path d="M7.7 30.4V24.4q2.6.6 2.9 3.4" />
        </g>
      </g>
    </svg>
  );
}
