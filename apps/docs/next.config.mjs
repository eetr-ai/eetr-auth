import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';

const workspaceRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

// GitHub Pages serves this project site under the repo name, so production
// assets must live under `/eetr-auth`. Local `next dev` runs at the root.
// A clean `/docs` prefix would require a custom domain (declined).
const basePath = process.env.NODE_ENV === 'production' ? '/eetr-auth' : '';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  basePath,
  images: { unoptimized: true },
  // Exposed to the client so the static Orama search index is fetched from the
  // basePath-prefixed URL in production (otherwise search 404s only when deployed).
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Silence Next's monorepo workspace-root inference (multiple lockfiles).
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
};

export default withMDX(config);
