import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { getSite } from "@/lib/content/cached";
import { JsonLd } from "@/components/JsonLd";
import { siteJsonLd } from "@/lib/seo";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
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
