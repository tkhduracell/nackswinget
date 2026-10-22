import type { ReactNode } from "react";
import { Img } from "@/components/Img";
import { publicUrl } from "@/lib/media/urls";
import { RichText } from "@/components/RichText";
import type { Section } from "@/lib/content/types";
import { DansSeWidget } from "./DansSeWidget";
import { PushSubscribe } from "./PushSubscribe";

// Pure section renderer shared by the public site (server) and the admin
// live preview (client). Sections that need server data (calendar, post
// list) are rendered through `slots` so this file has no server imports.

export interface SectionSlots {
  calendar(section: Extract<Section, { type: "calendar" }>, id: string): ReactNode;
  postList(section: Extract<Section, { type: "postList" }>): ReactNode;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Divi row grid: one track per 1/n of the row (n = common denominator), each column spans its share. */
function rowGrid(widths: string[]): { cols: number; spans: number[] } {
  const fractions = widths.map((w) => w.split("/").map(Number) as [number, number]);
  const cols = fractions.reduce((acc, [, b]) => (acc * b) / gcd(acc, b), 1);
  return { cols, spans: fractions.map(([a, b]) => (a * cols) / b) };
}

/** Accessible name for an image link: its alt/caption, else the link target. */
function linkLabel(text: string | undefined, href: string): string {
  if (text?.trim()) return text.trim();
  try {
    const u = new URL(href, "https://nackswinget.se");
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).replace(/[-_]+/g, " ") : u.hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

function ext(href: string) {
  return /^https?:\/\//.test(href) && !/^https?:\/\/(www\.)?nackswinget\.se/.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

export function SectionView({ section, slots, index, first }: { section: Section; slots: SectionSlots; index: string; first: boolean }) {
  switch (section.type) {
    case "hero":
      return (
        <section className={section.image ? "hero hero-image" : "hero"}>
          {section.image && <Img image={section.image} sizes="100vw" priority className="hero-bg" alt="" />}
          <div className="hero-inner">
            <h1>{section.title}</h1>
            {section.subtitle && <p className="hero-sub">{section.subtitle}</p>}
            {section.buttons.length > 0 && (
              <p className="hero-buttons">
                {section.buttons.map((b) => (
                  <a key={b.href + b.label} className="button button-lg" href={b.href} {...ext(b.href)}>
                    {b.label}
                  </a>
                ))}
              </p>
            )}
          </div>
        </section>
      );
    case "richText":
      return <RichText doc={section.doc} className={section.variant && section.variant !== "plain" ? `box ${section.variant}` : undefined} />;
    case "columns": {
      const grid = rowGrid(section.columns.map((c) => c.width));
      return (
        <div className="columns" style={{ ["--cols" as string]: grid.cols }}>
          {section.columns.map((c, i) => (
            <div key={i} className="column" style={{ ["--span" as string]: grid.spans[i] }}>
              <SectionList sections={c.sections} slots={slots} prefix={`${index}-${i}`} />
            </div>
          ))}
        </div>
      );
    }
    case "linkBoxes":
      return (
        <ul className="link-boxes">
          {section.items.map((item) => (
            <li key={item.href + item.title}>
              <a href={item.href} {...ext(item.href)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- tiny inline icon */}
                {item.icon && <img src={item.icon.startsWith("data:") ? item.icon : publicUrl(item.icon)} alt="" width={28} height={28} decoding="async" />}
                <span>{item.title}</span>
              </a>
            </li>
          ))}
        </ul>
      );
    case "postList":
      return slots.postList(section);
    case "calendar":
      return section.variant ? <div className={`box ${section.variant}`}>{slots.calendar(section, index)}</div> : slots.calendar(section, index);
    case "embed": {
      const style = section.aspect === "auto" ? { height: section.height ?? 600 } : { aspectRatio: section.aspect };
      return (
        <div className="embed" style={style}>
          <iframe src={section.url} title={section.title} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        </div>
      );
    }
    case "dansSeWidget":
      return <DansSeWidget href={section.href} label={section.label} />;
    case "fileList":
      return (
        <div className="file-list">
          {section.title && <h2>{section.title}</h2>}
          <ul>
            {section.items.map((f) => (
              <li key={f.href}>
                <a href={f.href} target="_blank" rel="noopener noreferrer">
                  {f.title}
                </a>
                {f.date && <span className="muted"> {f.date}</span>}
              </li>
            ))}
          </ul>
        </div>
      );
    case "image": {
      const shown = section.image.displayWidth;
      const img = <Img image={section.image} priority={first} sizes={shown ? `${shown}px` : "(min-width: 1080px) 1080px, 100vw"} />;
      return (
        <figure className="image-section" style={shown ? { maxWidth: shown } : undefined}>
          {section.href ? (
            <a href={section.href} {...ext(section.href)} aria-label={linkLabel(section.caption || section.image.alt, section.href)}>
              {img}
            </a>
          ) : (
            img
          )}
          {section.caption && <figcaption>{section.caption}</figcaption>}
        </figure>
      );
    }
    case "divider":
      return <hr className="divider" />;
    case "pushSubscribe":
      return <PushSubscribe />;
    default:
      return null;
  }
}

export function SectionList({ sections, slots, prefix = "s" }: { sections: Section[]; slots: SectionSlots; prefix?: string }) {
  return (
    <>
      {sections.map((s, i) => (
        <SectionView key={`${prefix}-${i}`} section={s} slots={slots} index={`${prefix}-${i}`} first={prefix === "s" && i === 0} />
      ))}
    </>
  );
}
