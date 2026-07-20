import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Boxes,
  Cpu,
  Globe,
  KeyRound,
  Package,
  Plug,
  Rocket,
  ScanFace,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { appName, gitConfig } from '@/lib/shared';

const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.74 1.27 3.4.97.11-.76.41-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.42.36.8 1.08.8 2.18v3.23c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

const features = [
  {
    icon: ShieldCheck,
    color: 'text-emerald-500',
    title: 'OAuth 2.1 + OIDC',
    body: 'Authorization Code + PKCE, Client Credentials, and Refresh Token with rotation. Full OIDC discovery, JWKS, and /userinfo.',
    href: '/docs/features/oauth-and-grants',
  },
  {
    icon: ScanFace,
    color: 'text-sky-500',
    title: 'Modern authentication',
    body: 'Argon2id passwords, WebAuthn passkeys, email OTP and authenticator-app (TOTP) MFA, and Google sign-in.',
    href: '/docs/features/authentication',
  },
  {
    icon: Cpu,
    color: 'text-violet-500',
    title: 'Edge-optimized hashing',
    body: 'Argon2id runs in an isolated Rust/Wasm Worker to keep expensive hashing off the main isolate’s CPU budget.',
    href: '/docs/architecture/argon-hasher',
  },
  {
    icon: Plug,
    color: 'text-amber-500',
    title: 'MCP-ready',
    body: 'RFC 7591 Dynamic Client Registration lets MCP clients self-register as public, PKCE-only clients with audience binding.',
    href: '/docs/guides/mcp-server-dcr',
  },
  {
    icon: Package,
    color: 'text-rose-500',
    title: 'Typed client library',
    body: '@eetr/eetr-auth-client — discovery, token management, introspection, and JWT validation for browser, Node, and Workers.',
    href: '/docs/client-library',
  },
  {
    icon: KeyRound,
    color: 'text-teal-500',
    title: 'Resource indicators',
    body: 'RFC 8707 audience binding ties an access token to a specific protected resource, preserved through refresh rotation.',
    href: '/docs/features/tokens',
  },
];

const guides = [
  { icon: Plug, color: 'text-amber-500', title: 'MCP server with DCR', href: '/docs/guides/mcp-server-dcr' },
  { icon: Zap, color: 'text-rose-500', title: 'WAF & rate limiting', href: '/docs/guides/waf-rate-limiting' },
  { icon: BadgeCheck, color: 'text-emerald-500', title: 'MFA & TOTP', href: '/docs/guides/mfa-totp' },
  { icon: Globe, color: 'text-sky-500', title: 'SPA integration', href: '/docs/guides/spa-public-client' },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-fd-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-70 [background:radial-gradient(60%_50%_at_50%_0%,rgba(249,115,22,0.15),transparent_70%)]"
        />
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card px-3 py-1 text-sm text-fd-muted-foreground">
            <Boxes className="size-4 text-orange-500" />
            Cloudflare Workers template
          </span>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Your own <span className="text-orange-500">OAuth 2.1</span> &amp; OpenID Connect server, on the edge
          </h1>
          <p className="max-w-2xl text-lg text-fd-muted-foreground">
            {appName} is a production-ready authorization server that runs entirely on Cloudflare
            Workers, D1, and R2. Fork it, point it at your domain, and deploy in minutes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center gap-2 rounded-full bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
            >
              <Rocket className="size-4" />
              Get started
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full border border-fd-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
            >
              <BookOpen className="size-4" />
              Documentation
            </Link>
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-fd-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
            >
              <GithubMark className="size-4" />
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group flex flex-col gap-3 rounded-2xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-primary/40 hover:bg-fd-accent/40"
            >
              <f.icon className={`size-7 ${f.color}`} />
              <h3 className="flex items-center gap-1 font-semibold">
                {f.title}
                <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </h3>
              <p className="text-sm text-fd-muted-foreground">{f.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Argon2id highlight band */}
      <section className="border-y border-fd-border bg-fd-card/50">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-fd-border px-3 py-1 text-xs font-medium text-violet-500">
              <Cpu className="size-4" />
              Built for the free CPU quota
            </span>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Argon2id in Rust, off the hot path
            </h2>
            <p className="text-fd-muted-foreground">
              Cloudflare limits CPU per isolate invocation — the Free plan caps it at 10&nbsp;ms per
              request, far less than a properly-tuned Argon2id hash needs. {appName} isolates hashing
              in a dedicated Rust/Wasm Worker so the auth Worker stays cheap on its hot paths, and the
              hasher gets its own raised CPU budget.
            </p>
            <Link
              href="/docs/architecture/argon-hasher"
              className="inline-flex w-fit items-center gap-1 text-sm font-medium text-fd-primary hover:underline"
            >
              How the argon-hasher works
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="rounded-2xl border border-fd-border bg-fd-background p-6 font-mono text-sm">
            <div className="mb-3 flex items-center gap-2 text-fd-muted-foreground">
              <Cpu className="size-4 text-violet-500" />
              apps/argon-hasher/wrangler.toml
            </div>
            <pre className="overflow-x-auto text-fd-foreground">
{`[limits]
cpu_ms = 30000

[[services]]
binding = "ARGON_HASHER"
service = "argon-hasher"

  [services.props]
  internal = true`}
            </pre>
          </div>
        </div>
      </section>

      {/* Guides */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="mb-6 flex items-center gap-2">
          <BookOpen className="size-5 text-orange-500" />
          <h2 className="text-xl font-semibold">Practical guides</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {guides.map((g) => (
            <Link
              key={g.title}
              href={g.href}
              className="group flex items-center gap-3 rounded-xl border border-fd-border bg-fd-card p-4 transition-colors hover:border-fd-primary/40 hover:bg-fd-accent/40"
            >
              <g.icon className={`size-5 ${g.color}`} />
              <span className="text-sm font-medium">{g.title}</span>
              <ArrowRight className="ml-auto size-4 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
