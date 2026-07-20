export const appName = 'eetr-auth';
export const appTagline =
  'OAuth 2.1 & OpenID Connect authorization server — a Cloudflare Workers template.';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'eetr-ai',
  repo: 'eetr-auth',
  branch: 'main',
};

// GitHub Pages serves this project site under `/eetr-auth` in production. This
// mirrors `basePath` in next.config.mjs and is used where a raw (non-<Link>)
// URL must be basePath-aware, e.g. the static search index fetch.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// Origin the site is deployed under, used as `metadataBase` so social-card
// (OpenGraph) image URLs resolve to absolute URLs.
export const siteOrigin = 'https://eetr-ai.github.io';
