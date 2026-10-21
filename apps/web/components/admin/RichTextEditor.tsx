import { Node, mergeAttributes } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { youtubeId } from "@/lib/import/html";
import type { ImageAttrs, RichDoc } from "@/lib/content/types";
import { fromTiptap, toTiptap, type TTNode } from "@/lib/admin/tiptap";
import { imageUrl, publicUrl } from "@/lib/media/urls";
import { MediaPicker, type PickedMedia } from "./MediaPicker";

// Atom nodes for media and buttons. They render a simple preview in the
// editor; the public site renders them with the real components.

const ImageNode = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null }, alt: { default: "" }, width: { default: null }, height: { default: null }, variants: { default: [] } };
  },
  parseHTML: () => [{ tag: "img[data-nsw-src]" }],
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    const a = HTMLAttributes as unknown as { src: string; alt: string; variants: number[] };
    return ["img", mergeAttributes({ "data-nsw-src": a.src, src: imageUrl(a.src, a.variants ?? []), alt: a.alt, class: "ed-img" })];
  },
});

const VideoNode = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { provider: { default: "youtube" }, id: { default: null }, title: { default: "" }, src720: { default: null }, src1080: { default: null }, poster: { default: null } };
  },
  parseHTML: () => [{ tag: "div[data-nsw-video]" }],
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    const a = HTMLAttributes as unknown as { provider: string; id?: string; poster?: string; title?: string };
    const thumb = a.provider === "youtube" ? `https://i.ytimg.com/vi/${a.id}/hqdefault.jpg` : a.poster ? publicUrl(a.poster) : "";
    return ["div", { "data-nsw-video": a.provider, class: "ed-video" }, ["img", { src: thumb, alt: "" }], ["span", {}, `▶ ${a.title || (a.provider === "youtube" ? "YouTube" : "Video")}`]];
  },
});

const ButtonNode = Node.create({
  name: "button",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { href: { default: "" }, label: { default: "Läs mer" } };
  },
  parseHTML: () => [{ tag: "a[data-nsw-button]" }],
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    const a = HTMLAttributes as unknown as { href: string; label: string };
    return ["a", { "data-nsw-button": "1", class: "button", href: a.href }, a.label];
  },
});

function Btn({ on, active, children, title }: { on: () => void; active?: boolean; children: React.ReactNode; title: string }) {
  return (
    <button type="button" className={active ? "tb-btn active" : "tb-btn"} onMouseDown={(e) => e.preventDefault()} onClick={on} title={title} aria-label={title}>
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, placeholder }: { value: RichDoc; onChange: (doc: RichDoc) => void; placeholder?: string }) {
  const [picker, setPicker] = useState<null | "image" | "video">(null);
  const lastEmitted = useRef<string>(JSON.stringify(value));

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: null, target: null } },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Skriv här…" }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ImageNode,
      VideoNode,
      ButtonNode,
    ],
    content: toTiptap(value),
    editorProps: {
      attributes: { class: "prose ed-content" },
      // Pasted text from Word/Docs keeps structure (headings, lists, bold) but no styling.
      transformPastedHTML: (html) => html.replace(/\sstyle="[^"]*"/gi, "").replace(/\sclass="[^"]*"/gi, ""),
    },
    onUpdate: ({ editor }) => {
      const doc = fromTiptap(editor.getJSON() as TTNode);
      const key = JSON.stringify(doc);
      if (key === lastEmitted.current) return;
      lastEmitted.current = key;
      onChange(doc);
    },
  });

  // External value changes (e.g. restoring a version) replace the content.
  useEffect(() => {
    if (!editor) return;
    const key = JSON.stringify(value);
    if (key === lastEmitted.current) return;
    lastEmitted.current = key;
    editor.commands.setContent(toTiptap(value), { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="ed-shell">Laddar redigeraren…</div>;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Länkadress (lämna tomt för att ta bort)", prev ?? "https://");
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  const addButton = () => {
    const label = window.prompt("Knapptext", "Läs mer");
    if (!label) return;
    const href = window.prompt("Länkadress", "/");
    if (!href) return;
    editor.chain().focus().insertContent({ type: "button", attrs: { label, href } }).run();
  };

  const addYouTube = () => {
    const url = window.prompt("YouTube-länk");
    const id = url ? youtubeId(url) : null;
    if (url && !id) return window.alert("Känner inte igen YouTube-länken");
    if (id) editor.chain().focus().insertContent({ type: "video", attrs: { provider: "youtube", id, title: "" } }).run();
  };

  const onPick = (m: PickedMedia) => {
    setPicker(null);
    if (m.kind === "image") {
      const attrs: ImageAttrs = m.image;
      editor.chain().focus().insertContent({ type: "image", attrs }).run();
    } else if (m.kind === "video") {
      editor.chain().focus().insertContent({ type: "video", attrs: { provider: "file", ...m.renditions, title: m.name } }).run();
    }
  };

  return (
    <div className="ed-shell">
      <div className="ed-toolbar" role="toolbar" aria-label="Formatering">
        <Btn title="Fetstil" on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
          <b>B</b>
        </Btn>
        <Btn title="Kursiv" on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
          <i>I</i>
        </Btn>
        <Btn title="Rubrik" on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>
          H2
        </Btn>
        <Btn title="Underrubrik" on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}>
          H3
        </Btn>
        <span className="tb-sep" />
        <Btn title="Punktlista" on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
          • Lista
        </Btn>
        <Btn title="Numrerad lista" on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
          1. Lista
        </Btn>
        <Btn title="Citat" on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
          ”
        </Btn>
        <Btn title="Länk" on={setLink} active={editor.isActive("link")}>
          Länk
        </Btn>
        <span className="tb-sep" />
        <Btn title="Bild" on={() => setPicker("image")}>
          Bild
        </Btn>
        <Btn title="Video från biblioteket" on={() => setPicker("video")}>
          Video
        </Btn>
        <Btn title="YouTube" on={addYouTube}>
          YouTube
        </Btn>
        <Btn title="Knapp" on={addButton}>
          Knapp
        </Btn>
        <Btn title="Tabell" on={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}>
          Tabell
        </Btn>
        <Btn title="Avdelare" on={() => editor.chain().focus().setHorizontalRule().run()}>
          ―
        </Btn>
        {editor.isActive("table") && (
          <>
            <span className="tb-sep" />
            <Btn title="Lägg till rad" on={() => editor.chain().focus().addRowAfter().run()}>
              +Rad
            </Btn>
            <Btn title="Lägg till kolumn" on={() => editor.chain().focus().addColumnAfter().run()}>
              +Kol
            </Btn>
            <Btn title="Ta bort rad" on={() => editor.chain().focus().deleteRow().run()}>
              −Rad
            </Btn>
            <Btn title="Ta bort kolumn" on={() => editor.chain().focus().deleteColumn().run()}>
              −Kol
            </Btn>
            <Btn title="Ta bort tabell" on={() => editor.chain().focus().deleteTable().run()}>
              ✕Tabell
            </Btn>
          </>
        )}
        <span className="tb-sep" />
        <Btn title="Ångra" on={() => editor.chain().focus().undo().run()}>
          ↶
        </Btn>
        <Btn title="Gör om" on={() => editor.chain().focus().redo().run()}>
          ↷
        </Btn>
      </div>
      <EditorContent editor={editor} />
      {picker && <MediaPicker accept={picker} onPick={onPick} onClose={() => setPicker(null)} />}
    </div>
  );
}
