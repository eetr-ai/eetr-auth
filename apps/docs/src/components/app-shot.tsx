import { basePath } from '@/lib/shared';

/**
 * A framed application screenshot. Files live in `apps/docs/public/screenshots/`.
 * Uses a plain <img> (not next/image) so the static export never processes the
 * file at build time, and prefixes the basePath so it resolves on GitHub Pages.
 */
export function AppShot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="my-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${basePath}/screenshots/${src}`}
        alt={alt}
        loading="lazy"
        className="w-full rounded-xl border border-fd-border shadow-sm"
      />
      {caption ? (
        <figcaption className="mt-2 text-center text-sm text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
