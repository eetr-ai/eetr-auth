'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * Renders a Mermaid diagram on the client. Kept out of the server bundle via a
 * dynamic import so the (heavy) mermaid library ships only to browsers, which is
 * compatible with the static export.
 */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId();
  const [svg, setSvg] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const { default: mermaid } = await import('mermaid');

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        fontFamily: 'inherit',
        theme: resolvedTheme === 'dark' ? 'dark' : 'default',
      });

      const renderId = `mermaid-${id.replace(/[^a-zA-Z0-9]/g, '')}`;

      try {
        const result = await mermaid.render(renderId, chart.trim());
        if (!cancelled) setSvg(result.svg);
      } catch (error) {
        if (!cancelled) setSvg(`<pre>${String(error)}</pre>`);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
