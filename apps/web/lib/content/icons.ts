// Built-in link box icons: rendered as inline SVG components instead of an
// image. Stored in `linkBoxes[].icon` as `builtin:<name>`. Client-safe.

export const BUILTIN_DANCER = "builtin:dancer";

/** sha1 of the WordPress "dancing person" PNG (the "Våra Kurser & träningar" link box). */
export const DANCER_PNG_SHA1 = "ced4affa4309526ba397ed5ad0606a2b3cb8f538";

/** Path `import-snapshot` stored that PNG under before it was mapped to the built-in icon. */
const DANCER_PNG_PATH = `web/icons/${DANCER_PNG_SHA1.slice(0, 16)}.png`;

/** The built-in icon a link box icon value stands for, if any. */
export function builtinIcon(icon: string | undefined): "dancer" | null {
  return icon === BUILTIN_DANCER || icon === DANCER_PNG_PATH ? "dancer" : null;
}
