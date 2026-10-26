import { preload } from "react-dom";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { getSite } from "@/lib/content/cached";
import { JsonLd } from "@/components/JsonLd";
import { siteJsonLd } from "@/lib/seo";

// --bg-texture in globals.css: the hero and footer background, and the LCP
// element of the start page and of short pages. CSS backgrounds are found late
// (after the stylesheet), so tell the browser up front.
const BG_TEXTURE = "https://storage.googleapis.com/nackswinget-af7ef.appspot.com/web/variants/uploads/2022/11/bg-1/640.webp";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  preload(BG_TEXTURE, { as: "image", fetchPriority: "high" });
  const { settings, nav } = await getSite();
  return (
    <div className="site">
      <a href="#main" className="skip-link">
        Hoppa till innehållet
      </a>
      <Header nav={nav} logo={settings.logo} siteName={settings.siteName} />
      <main id="main">{children}</main>
      <Footer settings={settings} />
      <JsonLd data={siteJsonLd(settings)} />
    </div>
  );
}
