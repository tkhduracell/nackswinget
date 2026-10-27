import type { ReactNode } from "react";
import type { Banner, PuffStyle } from "@/lib/content/types";

// The start page puff in each of its styles. Pure markup shared by the site
// (StarBanner) and the admin's live preview; the look lives in globals.css.
// The text is always in .star-text, so phones can collapse every style into
// the same plain band.

/** Larger type for short texts, smaller for long ones (the banner text is at most 120 chars). */
function fit(text: string, max: number, min: number, chars: number): number {
  return Math.max(min, Math.min(max, (max * chars) / Math.max(text.length, 1)));
}

/** 14-point starburst in a 150×150 box. */
const BURST =
  "75,1 88.4,16.5 107.1,8.3 112.4,28.1 132.9,28.9 129.1,49 147.1,58.5 135,75 147.1,91.5 129.1,101 132.9,121.1 112.4,121.9 107.1,141.7 88.4,133.5 75,149 61.6,133.5 42.9,141.7 37.6,121.9 17.1,121.1 20.9,101 2.9,91.5 15,75 2.9,58.5 20.9,49 17.1,28.9 37.6,28.1 42.9,8.3 61.6,16.5";
/** 30-point seal edge in a 150×150 box. */
const SEAL =
  "75,1 82.1,7.4 90.4,2.6 96,10.3 105.1,7.4 109,16.1 118.5,15.1 120.5,24.5 130,25.5 130,35 139.1,38 137.1,47.3 145.4,52.1 141.5,60.9 148.6,67.3 143,75 148.6,82.7 141.5,89.1 145.4,97.9 137.1,102.7 139.1,112 130,115 130,124.5 120.5,125.5 118.5,134.9 109,133.9 105.1,142.6 96,139.7 90.4,147.4 82.1,142.6 75,149 67.9,142.6 59.6,147.4 54,139.7 44.9,142.6 41,133.9 31.5,134.9 29.5,125.5 20,124.5 20,115 10.9,112 12.9,102.7 4.6,97.9 8.5,89.1 1.4,82.7 7,75 1.4,67.3 8.5,60.9 4.6,52.1 12.9,47.3 10.9,38 20,35 20,25.5 29.5,24.5 31.5,15.1 41,16.1 44.9,7.4 54,10.3 59.6,2.6 67.9,7.4";

function decor(style: PuffStyle, text: string, id: string): ReactNode {
  switch (style) {
    case "starburst":
      return (
        <svg className="puff-shape" viewBox="0 0 150 150" aria-hidden="true">
          <polygon points={BURST} />
        </svg>
      );
    case "ring":
      return (
        <svg className="puff-shape" viewBox="0 0 160 160" aria-hidden="true">
          <defs>
            <path id={`${id}-ring`} d="M80,80 m-62,0 a62,62 0 1,1 124,0 a62,62 0 1,1 -124,0" />
          </defs>
          <circle className="puff-ring-bg" cx="80" cy="80" r="78" />
          <g className="puff-ring-text">
            <text fontSize={fit(text, 11.5, 7.5, 44)} fontWeight="800" letterSpacing="1">
              <textPath href={`#${id}-ring`} textLength="386" lengthAdjust="spacing">
                {`${text.toUpperCase()} • `}
              </textPath>
            </text>
          </g>
          <circle className="puff-ring-core" cx="80" cy="80" r="44" />
          <path className="puff-ring-arrow" d="M70 90 L90 70 M73 70 H90 V87" />
        </svg>
      );
    case "seal":
      return (
        <svg className="puff-shape" viewBox="0 0 150 150" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f6dc8e" />
              <stop offset="0.5" stopColor="#d4a640" />
              <stop offset="1" stopColor="#f0cf78" />
            </linearGradient>
            <clipPath id={`${id}-clip`}>
              <polygon points={SEAL} />
            </clipPath>
            <path id={`${id}-top`} d="M28,75 A47,47 0 0 1 122,75" />
            <path id={`${id}-bottom`} d="M24,75 A51,51 0 0 0 126,75" />
          </defs>
          <g clipPath={`url(#${id}-clip)`}>
            <rect width="150" height="150" fill={`url(#${id}-gold)`} />
            <rect className="puff-sheen" y="-20" width="28" height="190" />
          </g>
          <circle className="puff-seal-ring" cx="75" cy="75" r="58" />
          <text className="puff-seal-arc" textAnchor="middle">
            <textPath href={`#${id}-top`} startOffset="50%">
              NACKSWINGET · 40 ÅR
            </textPath>
          </text>
          <text className="puff-seal-arc" textAnchor="middle">
            <textPath href={`#${id}-bottom`} startOffset="50%">
              JUBILEUM
            </textPath>
          </text>
        </svg>
      );
    case "ticket":
      return (
        <span className="puff-stub" aria-hidden="true">
          <span>NYTT</span>
        </span>
      );
    case "tape": {
      const run = `${text.toUpperCase()} ✦ `.repeat(4);
      return (
        <span className="puff-track" aria-hidden="true">
          <span>{run}</span>
          <span>{run}</span>
        </span>
      );
    }
    default:
      return null;
  }
}

/** Font size for text inside a shape; the ticket and tape lay their text out freely. */
function textSize(style: PuffStyle, text: string): number | undefined {
  if (style === "starburst") return fit(text, 17, 11.5, 34);
  if (style === "seal") return fit(text, 15, 11, 30);
  return undefined;
}

export function PuffBadge({ banner, id = "puff" }: { banner: Banner; id?: string }) {
  const style = banner.style ?? "classic";
  const size = textSize(style, banner.text);
  const children = (
    <>
      {decor(style, banner.text, id)}
      <span className="star-text" style={size ? { fontSize: `${size}px` } : undefined}>
        {banner.text}
      </span>
    </>
  );
  const className = `star puff-${style}`;
  return banner.href ? (
    <a className={className} href={banner.href}>
      {children}
    </a>
  ) : (
    <div className={className}>{children}</div>
  );
}
