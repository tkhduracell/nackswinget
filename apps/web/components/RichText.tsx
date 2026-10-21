import type { ReactNode } from "react";
import type { Mark, RichDoc, RichNode } from "@/lib/content/types";
import { Img } from "./Img";
import { YouTube } from "./YouTube";
import { publicUrl } from "@/lib/media/urls";

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href) && !/^https?:\/\/(www\.)?nackswinget\.se/.test(href);
}

function withMarks(text: ReactNode, marks: Mark[] | undefined, key: number): ReactNode {
  let out = text;
  for (const m of marks ?? []) {
    if (m.type === "bold") out = <strong>{out}</strong>;
    else if (m.type === "italic") out = <em>{out}</em>;
    else if (m.type === "link") {
      const ext = isExternal(m.attrs.href);
      out = (
        <a href={m.attrs.href} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {out}
        </a>
      );
    }
  }
  return <span key={key}>{out}</span>;
}

function children(nodes: RichNode[] | undefined): ReactNode[] {
  return (nodes ?? []).map((n, i) => node(n, i));
}

function node(n: RichNode, key: number): ReactNode {
  switch (n.type) {
    case "text":
      return n.marks?.length ? withMarks(n.text, n.marks, key) : n.text;
    case "paragraph":
      return <p key={key}>{children(n.content)}</p>;
    case "heading":
      return n.attrs.level === 2 ? <h2 key={key}>{children(n.content)}</h2> : <h3 key={key}>{children(n.content)}</h3>;
    case "bulletList":
      return <ul key={key}>{children(n.content)}</ul>;
    case "orderedList":
      return <ol key={key}>{children(n.content)}</ol>;
    case "listItem":
      return <li key={key}>{children(n.content)}</li>;
    case "blockquote":
      return <blockquote key={key}>{children(n.content)}</blockquote>;
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "image":
      return (
        <figure key={key} className="rt-figure">
          <Img image={n.attrs} />
        </figure>
      );
    case "video":
      if (n.attrs.provider === "youtube") return <YouTube key={key} id={n.attrs.id} title={n.attrs.title} />;
      return (
        <video
          key={key}
          className="rt-video"
          controls
          preload="none"
          playsInline
          poster={n.attrs.poster ? publicUrl(n.attrs.poster) : undefined}
        >
          {n.attrs.src1080 && <source src={publicUrl(n.attrs.src1080)} type="video/mp4" media="(min-width: 960px)" />}
          <source src={publicUrl(n.attrs.src720)} type="video/mp4" />
        </video>
      );
    case "button":
      return (
        <p key={key}>
          <a className="button" href={n.attrs.href} {...(isExternal(n.attrs.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {n.attrs.label}
          </a>
        </p>
      );
    case "table":
      return (
        <div key={key} className="rt-table">
          <table>
            <tbody>{children(n.content)}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr key={key}>{children(n.content)}</tr>;
    case "tableCell":
      return n.attrs?.header ? <th key={key}>{children(n.content)}</th> : <td key={key}>{children(n.content)}</td>;
    default:
      return null;
  }
}

export function RichText({ doc, className }: { doc: RichDoc; className?: string }) {
  return <div className={className ? `prose ${className}` : "prose"}>{children(doc.content)}</div>;
}
