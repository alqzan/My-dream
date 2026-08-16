// Native document links are used by the mobile bar so a stalled App Router
// RSC request cannot swallow a tap. Keep the static-export base path that
// next/link normally adds for us on GitHub Pages.
export function nativeNavHref(href: string, basePath = ""): string {
  const base = basePath.replace(/^\/+|\/+$/g, "");
  const normalizedBase = base ? `/${base}` : "";
  const normalizedHref = href.startsWith("/") ? href : `/${href}`;
  const withTrailingSlash =
    normalizedHref === "/" || normalizedHref.endsWith("/")
      ? normalizedHref
      : `${normalizedHref}/`;

  return `${normalizedBase}${withTrailingSlash}`;
}
