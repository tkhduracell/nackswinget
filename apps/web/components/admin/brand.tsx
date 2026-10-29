import { publicUrl, variantPath, wpUploadPath } from "@/lib/media/urls";

// The same white-on-transparent logo the public header shows (480w WebP).
export const LOGO_URL = publicUrl(variantPath(wpUploadPath("2022/10/cropped-NSW.png"), 480));

export function AdminLogo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- small static logo
  return <img src={LOGO_URL} alt="Nackswinget" width={180} height={36} className={className ?? "admin-logo"} decoding="async" />;
}
