import type { ImageAttrs } from "@/lib/content/types";
import { imageUrl, publicUrl, srcSet } from "@/lib/media/urls";

interface Props {
  image: ImageAttrs;
  /** `sizes` attribute; defaults to full content width. */
  sizes?: string;
  priority?: boolean;
  className?: string;
  alt?: string;
}

/** Responsive WebP image served straight from Cloud Storage. */
export function Img({ image, sizes = "(min-width: 1080px) 800px, 100vw", priority, className, alt }: Props) {
  const set = srcSet(image.src, image.variants);
  const style = image.focal ? { objectPosition: `${image.focal.x * 100}% ${image.focal.y * 100}%` } : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- variants are pre-generated; next/image would re-optimise through the server
    <img
      src={set ? imageUrl(image.src, image.variants) : publicUrl(image.src)}
      srcSet={set}
      sizes={set ? sizes : undefined}
      width={image.width}
      height={image.height}
      alt={alt ?? image.alt}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : undefined}
      className={className}
      style={style}
    />
  );
}
