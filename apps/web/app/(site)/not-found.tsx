import Link from "next/link";

export default function NotFound() {
  return (
    <article className="page">
      <header className="page-header">
        <div className="container">
          <h1>Sidan hittades inte</h1>
        </div>
      </header>
      <div className="container page-body">
        <p>Sidan du letar efter finns inte längre eller har flyttats.</p>
        <p>
          <Link className="button" href="/">
            Till startsidan
          </Link>
        </p>
      </div>
    </article>
  );
}
