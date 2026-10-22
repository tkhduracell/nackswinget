import Link from "next/link";

export default function NotFound() {
  return (
    <article className="page">
      <header className="page-header">
        <div className="container">
          <h1>Sidan hittades inte</h1>
        </div>
      </header>
      <div className="container page-body not-found">
        <p className="not-found-lead">Sidan du letar efter finns inte längre eller har flyttats.</p>
        <p>Prova sökningen uppe till höger, eller gå vidare härifrån:</p>
        <p className="not-found-links">
          <Link className="button" href="/">
            Till startsidan
          </Link>
          <Link className="button button-ghost" href="/kurser/">
            Kurser &amp; träningar
          </Link>
          <Link className="button button-ghost" href="/kalender/">
            Kalender
          </Link>
          <Link className="button button-ghost" href="/kontakt/">
            Kontakt
          </Link>
        </p>
      </div>
    </article>
  );
}
