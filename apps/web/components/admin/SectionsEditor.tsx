import { useState } from "react";
import type { CalendarFeed, ColumnWidth, ImageAttrs, Section } from "@/lib/content/types";
import { imageUrl } from "@/lib/media/urls";
import { MediaPicker, type PickedMedia } from "./MediaPicker";
import { Icon } from "./icons";
import { RichTextEditor } from "./RichTextEditor";

type S<T extends Section["type"]> = Extract<Section, { type: T }>;

export const SECTION_LABELS: Record<Section["type"], string> = {
  hero: "Toppbild (hero)",
  richText: "Text",
  columns: "Kolumner",
  linkBoxes: "Länkrutor",
  postList: "Nyhetslista",
  calendar: "Kalender",
  embed: "Inbäddat (karta, formulär…)",
  dansSeWidget: "dans.se-bokning",
  fileList: "Fillista (PDF)",
  image: "Bild",
  divider: "Avdelare",
  pushSubscribe: "Notiser (friträning)",
};

const EMPTY_DOC = { type: "doc" as const, content: [] };

export function newSection(type: Section["type"], feeds: CalendarFeed[]): Section {
  switch (type) {
    case "hero":
      return { type, title: "Rubrik", buttons: [] };
    case "richText":
      return { type, doc: EMPTY_DOC };
    case "columns":
      return { type, columns: [{ width: "1/2", sections: [] }, { width: "1/2", sections: [] }] };
    case "linkBoxes":
      return { type, items: [{ title: "Länk", href: "/" }] };
    case "postList":
      return { type, count: 6, showMore: true };
    case "calendar":
      return { type, feeds: feeds.map((f) => f.key), hiddenByDefault: [], view: "month", pastDays: 30, showLegend: true };
    case "embed":
      return { type, url: "https://", title: "Inbäddat innehåll", aspect: "16/9" };
    case "dansSeWidget":
      return { type, href: "https://dans.se/nsw/shop/", label: "Boka på dans.se" };
    case "fileList":
      return { type, items: [] };
    case "image":
      return { type, image: { src: "", alt: "", variants: [] } };
    case "divider":
      return { type };
    case "pushSubscribe":
      return { type };
  }
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

function ImageField({ value, onChange }: { value: ImageAttrs | undefined; onChange: (v: ImageAttrs | undefined) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="image-field">
      {value?.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin preview
        <img src={imageUrl(value.src, value.variants.length ? [Math.min(...value.variants)] : [])} alt="" />
      ) : (
        <span className="image-empty">
          <Icon name="image" size={22} />
          <span className="muted">Ingen bild vald</span>
        </span>
      )}
      <div className="row">
        <button type="button" className="button button-ghost button-sm" onClick={() => setOpen(true)}>
          <Icon name="image" size={16} />
          {value?.src ? "Byt bild" : "Välj bild"}
        </button>
        {value?.src && (
          <button type="button" className="button button-danger-ghost button-sm" onClick={() => onChange(undefined)}>
            Ta bort
          </button>
        )}
      </div>
      {value?.src && (
        <>
          <Field label="Alternativtext (för skärmläsare)">
            <input value={value.alt} onChange={(e) => onChange({ ...value, alt: e.target.value })} />
          </Field>
          <Field label="Fokuspunkt" hint="Vilken del av bilden som ska synas när den beskärs på mobil (0–100 %).">
            <div className="row">
              <input type="number" min={0} max={100} value={Math.round((value.focal?.x ?? 0.5) * 100)} onChange={(e) => onChange({ ...value, focal: { x: Number(e.target.value) / 100, y: value.focal?.y ?? 0.5 } })} aria-label="Fokus vågrätt" />
              <input type="number" min={0} max={100} value={Math.round((value.focal?.y ?? 0.5) * 100)} onChange={(e) => onChange({ ...value, focal: { x: value.focal?.x ?? 0.5, y: Number(e.target.value) / 100 } })} aria-label="Fokus lodrätt" />
            </div>
          </Field>
        </>
      )}
      {open && (
        <MediaPicker
          accept="image"
          onClose={() => setOpen(false)}
          onPick={(m: PickedMedia) => {
            setOpen(false);
            if (m.kind === "image") onChange(m.image);
          }}
        />
      )}
    </div>
  );
}

function ListEditor<T>({ items, onChange, render, add, addLabel }: { items: T[]; onChange: (items: T[]) => void; render: (item: T, set: (v: T) => void) => React.ReactNode; add: () => T; addLabel: string }) {
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="list-editor">
      {items.map((item, i) => (
        <div key={i} className="list-row">
          <div className="list-fields">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}</div>
          <div className="list-actions">
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Flytta upp">
              <Icon name="up" size={16} />
            </button>
            <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Flytta ner">
              <Icon name="down" size={16} />
            </button>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Ta bort">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="button button-ghost button-sm add-row" onClick={() => onChange([...items, add()])}>
        <Icon name="plus" size={16} />
        {addLabel}
      </button>
    </div>
  );
}

function SectionForm({ section, onChange, feeds, categories }: { section: Section; onChange: (s: Section) => void; feeds: CalendarFeed[]; categories: { slug: string; name: string }[] }) {
  switch (section.type) {
    case "hero": {
      const s = section;
      return (
        <>
          <Field label="Rubrik">
            <input value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })} />
          </Field>
          <Field label="Underrubrik">
            <input value={s.subtitle ?? ""} onChange={(e) => onChange({ ...s, subtitle: e.target.value || undefined })} />
          </Field>
          <Field label="Bakgrundsbild (valfri)">
            <ImageField value={s.image} onChange={(image) => onChange({ ...s, image })} />
          </Field>
          <Field label="Knappar (max 2)">
            <ListEditor
              items={s.buttons}
              onChange={(buttons) => onChange({ ...s, buttons: buttons.slice(0, 2) })}
              add={() => ({ label: "Knapp", href: "/" })}
              addLabel="Lägg till knapp"
              render={(b, set) => (
                <>
                  <input value={b.label} onChange={(e) => set({ ...b, label: e.target.value })} aria-label="Knapptext" />
                  <input value={b.href} onChange={(e) => set({ ...b, href: e.target.value })} aria-label="Länk" />
                </>
              )}
            />
          </Field>
        </>
      );
    }
    case "richText": {
      const s = section;
      return (
        <>
          <Field label="Stil">
            <select value={s.variant ?? "plain"} onChange={(e) => onChange({ ...s, variant: e.target.value as S<"richText">["variant"] })}>
              <option value="plain">Vanlig text</option>
              <option value="boxLeft">Grå ruta, röd kant till vänster</option>
              <option value="boxTop">Grå ruta, röd kant upptill</option>
            </select>
          </Field>
          <RichTextEditor value={s.doc} onChange={(doc) => onChange({ ...s, doc, needsReview: undefined })} />
        </>
      );
    }
    case "columns": {
      const s = section;
      const layouts: Record<string, ColumnWidth[]> = {
        "1/2 + 1/2": ["1/2", "1/2"],
        "3/4 + 1/4": ["3/4", "1/4"],
        "1/4 + 3/4": ["1/4", "3/4"],
        "2/3 + 1/3": ["2/3", "1/3"],
        "1/3 + 2/3": ["1/3", "2/3"],
        "1/3 + 1/3 + 1/3": ["1/3", "1/3", "1/3"],
      };
      const current = s.columns.map((c) => c.width).join(" + ");
      return (
        <>
          <Field label="Layout" hint="På mobil visas kolumnerna under varandra.">
            <select
              value={Object.keys(layouts).includes(current) ? current : ""}
              onChange={(e) => {
                const widths = layouts[e.target.value];
                onChange({ ...s, columns: widths.map((w, i) => ({ width: w, sections: s.columns[i]?.sections ?? [] })) });
              }}
            >
              {!Object.keys(layouts).includes(current) && <option value="">{current}</option>}
              {Object.keys(layouts).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <div className="columns-editor">
            {s.columns.map((c, i) => (
              <div key={i} className="column-editor">
                <h4>Kolumn {i + 1} ({c.width})</h4>
                <SectionsEditor
                  sections={c.sections}
                  onChange={(sections) => onChange({ ...s, columns: s.columns.map((x, j) => (j === i ? { ...x, sections } : x)) })}
                  feeds={feeds}
                  categories={categories}
                  nested
                />
              </div>
            ))}
          </div>
        </>
      );
    }
    case "linkBoxes": {
      const s = section;
      return (
        <ListEditor
          items={s.items}
          onChange={(items) => onChange({ ...s, items })}
          add={() => ({ title: "Länk", href: "/" })}
          addLabel="Lägg till länkruta"
          render={(item, set) => (
            <>
              <input value={item.title} onChange={(e) => set({ ...item, title: e.target.value })} aria-label="Text" />
              <input value={item.href} onChange={(e) => set({ ...item, href: e.target.value })} aria-label="Länk" />
            </>
          )}
        />
      );
    }
    case "postList": {
      const s = section;
      return (
        <>
          <Field label="Rubrik (valfri)">
            <input value={s.title ?? ""} onChange={(e) => onChange({ ...s, title: e.target.value || undefined })} />
          </Field>
          <Field label="Kategori">
            <select value={s.category ?? ""} onChange={(e) => onChange({ ...s, category: e.target.value || undefined })}>
              <option value="">Alla nyheter</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Antal">
            <input type="number" min={1} max={50} value={s.count} onChange={(e) => onChange({ ...s, count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={s.showMore} onChange={(e) => onChange({ ...s, showMore: e.target.checked })} /> Visa ”Fler nyheter”-knapp
          </label>
        </>
      );
    }
    case "calendar": {
      const s = section;
      const toggle = (list: string[], key: string, on: boolean) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));
      return (
        <>
          <Field label="Rubrik (valfri)">
            <input value={s.title ?? ""} onChange={(e) => onChange({ ...s, title: e.target.value || undefined })} />
          </Field>
          <Field label="Visning">
            <select value={s.view} onChange={(e) => onChange({ ...s, view: e.target.value as S<"calendar">["view"] })}>
              <option value="month">Månad</option>
              <option value="week">Vecka (två veckor)</option>
              <option value="list">Lista (kommande)</option>
            </select>
          </Field>
          <fieldset className="field">
            <legend>Kalendrar</legend>
            {feeds.map((f) => (
              <div key={f.key} className="row">
                <label className="check">
                  <input type="checkbox" checked={s.feeds.includes(f.key)} onChange={(e) => onChange({ ...s, feeds: toggle(s.feeds, f.key, e.target.checked) })} /> {f.name}
                </label>
                {s.feeds.includes(f.key) && s.view !== "list" && (
                  <label className="check muted">
                    <input type="checkbox" checked={s.hiddenByDefault.includes(f.key)} onChange={(e) => onChange({ ...s, hiddenByDefault: toggle(s.hiddenByDefault, f.key, e.target.checked) })} /> dold från start
                  </label>
                )}
              </div>
            ))}
          </fieldset>
          {s.view === "list" ? (
            <Field label="Antal aktiviteter">
              <input type="number" min={1} max={100} value={s.count ?? 6} onChange={(e) => onChange({ ...s, count: Number(e.target.value) || 6 })} />
            </Field>
          ) : (
            <>
              <Field label="Visa bakåt (dagar)">
                <input type="number" min={0} max={365} value={s.pastDays} onChange={(e) => onChange({ ...s, pastDays: Number(e.target.value) || 0 })} />
              </Field>
              <label className="check">
                <input type="checkbox" checked={s.showLegend} onChange={(e) => onChange({ ...s, showLegend: e.target.checked })} /> Visa kalenderval (färgrutor)
              </label>
            </>
          )}
        </>
      );
    }
    case "embed": {
      const s = section;
      return (
        <>
          <Field label="Adress (Google Maps, dans.se, YouTube, Microsoft Forms)">
            <input value={s.url} onChange={(e) => onChange({ ...s, url: e.target.value })} />
          </Field>
          <Field label="Beskrivning (för skärmläsare)">
            <input value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })} />
          </Field>
          <Field label="Format">
            <select value={s.aspect} onChange={(e) => onChange({ ...s, aspect: e.target.value as S<"embed">["aspect"] })}>
              <option value="16/9">Bred (16:9)</option>
              <option value="4/3">4:3</option>
              <option value="1/1">Kvadrat</option>
              <option value="auto">Fast höjd</option>
            </select>
          </Field>
          {s.aspect === "auto" && (
            <Field label="Höjd (px)">
              <input type="number" min={100} max={3000} value={s.height ?? 600} onChange={(e) => onChange({ ...s, height: Number(e.target.value) || 600 })} />
            </Field>
          )}
        </>
      );
    }
    case "dansSeWidget": {
      const s = section;
      return (
        <>
          <Field label="dans.se-adress" hint="T.ex. https://dans.se/nsw/shop/new">
            <input value={s.href} onChange={(e) => onChange({ ...s, href: e.target.value })} />
          </Field>
          <Field label="Knapptext (visas om dans.se inte laddar)">
            <input value={s.label} onChange={(e) => onChange({ ...s, label: e.target.value })} />
          </Field>
        </>
      );
    }
    case "fileList":
      return <FileListForm section={section} onChange={onChange} />;
    case "image": {
      const s = section;
      return (
        <>
          <ImageField value={s.image.src ? s.image : undefined} onChange={(image) => onChange({ ...s, image: image ?? { src: "", alt: "", variants: [] } })} />
          <Field label="Bildtext (valfri)">
            <input value={s.caption ?? ""} onChange={(e) => onChange({ ...s, caption: e.target.value || undefined })} />
          </Field>
          <Field label="Länk (valfri)">
            <input value={s.href ?? ""} onChange={(e) => onChange({ ...s, href: e.target.value || undefined })} />
          </Field>
        </>
      );
    }
    case "divider":
    case "pushSubscribe":
      return <p className="muted">Inga inställningar.</p>;
  }
}

function FileListForm({ section, onChange }: { section: S<"fileList">; onChange: (s: Section) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <Field label="Rubrik (valfri)">
        <input value={section.title ?? ""} onChange={(e) => onChange({ ...section, title: e.target.value || undefined })} />
      </Field>
      <ListEditor<S<"fileList">["items"][number]>
        items={section.items}
        onChange={(items) => onChange({ ...section, items })}
        add={() => ({ title: "Dokument", href: "https://" })}
        addLabel="Lägg till länk manuellt"
        render={(f, set) => (
          <>
            <input value={f.title} onChange={(e) => set({ ...f, title: e.target.value })} aria-label="Titel" />
            <input value={f.date ?? ""} onChange={(e) => set({ ...f, date: e.target.value || undefined })} aria-label="Datum" placeholder="Datum" />
          </>
        )}
      />
      <button type="button" className="button button-ghost button-sm" onClick={() => setPicking(true)}>
        <Icon name="upload" size={16} />
        Ladda upp / välj fil
      </button>
      {picking && (
        <MediaPicker
          accept="file"
          onClose={() => setPicking(false)}
          onPick={(m) => {
            setPicking(false);
            if (m.kind === "file") onChange({ ...section, items: [...section.items, { title: m.name.replace(/\.[a-z0-9]+$/i, ""), href: m.url }] });
          }}
        />
      )}
    </>
  );
}

export function SectionsEditor({
  sections,
  onChange,
  feeds,
  categories,
  nested,
}: {
  sections: Section[];
  onChange: (s: Section[]) => void;
  feeds: CalendarFeed[];
  categories: { slug: string; name: string }[];
  nested?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(nested ? null : 0);
  const [adding, setAdding] = useState<Section["type"]>("richText");
  const set = (i: number, s: Section) => onChange(sections.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: number) => {
    const next = [...sections];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
    setOpen(i + d);
  };
  const types = (Object.keys(SECTION_LABELS) as Section["type"][]).filter((t) => !(nested && (t === "columns" || t === "hero")));

  return (
    <div className={nested ? "sections-editor nested" : "sections-editor"}>
      {sections.map((s, i) => (
        <div key={i} className={open === i ? "section-card open" : "section-card"}>
          <div className="section-head">
            <button type="button" className="section-title" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <Icon name="right" size={16} className="icon section-chevron" />
              <span className="section-index">{i + 1}</span>
              <strong>{SECTION_LABELS[s.type]}</strong>
              {s.type === "richText" && s.needsReview && <span className="badge">Granska</span>}
            </button>
            <div className="list-actions">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Flytta upp">
              <Icon name="up" size={16} />
            </button>
              <button type="button" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label="Flytta ner">
              <Icon name="down" size={16} />
            </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Ta bort ”${SECTION_LABELS[s.type]}”?`)) onChange(sections.filter((_, j) => j !== i));
                }}
                aria-label="Ta bort sektion"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </div>
          {open === i && (
            <div className="section-body">
              <SectionForm section={s} onChange={(x) => set(i, x)} feeds={feeds} categories={categories} />
            </div>
          )}
        </div>
      ))}
      <div className="add-section">
        <select value={adding} onChange={(e) => setAdding(e.target.value as Section["type"])} aria-label="Typ av sektion">
          {types.map((t) => (
            <option key={t} value={t}>
              {SECTION_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={nested ? "button button-ghost button-sm" : "button button-ghost"}
          onClick={() => {
            onChange([...sections, newSection(adding, feeds)]);
            setOpen(sections.length);
          }}
        >
          <Icon name="plus" size={16} />
          Lägg till sektion
        </button>
      </div>
    </div>
  );
}
