import { useEffect, useState } from "react";

/**
 * Keeps a conditionally-rendered overlay mounted long enough for its exit
 * animation to play.
 *
 * Rendering on `open` directly would unmount the node the instant it closes,
 * so the exit animation never runs. Instead `mounted` trails `open` on the way
 * down by `durationMs`.
 *
 * The enter animation needs no equivalent trick: `animate-in` (tw-animate-css)
 * is a CSS *animation*, which runs from its `from` keyframe on mount. A
 * transition-based panel would additionally need a forced paint in the closed
 * state before flipping the class.
 *
 * Unmount is driven by a timer rather than `animationend` on purpose — under
 * `prefers-reduced-motion` the animation is suppressed and no `animationend`
 * would ever fire, which would strand the overlay mounted forever.
 *
 * The trade-off is that browsers clamp timers to ~1s in a hidden tab, so an
 * overlay closed just before the tab is backgrounded can linger. That is
 * deliberate: it only happens where nobody is watching the animation, whereas
 * the `animationend` failure mode strands the overlay in front of someone who
 * is. (This also makes exit timing unmeasurable in a hidden page — check
 * `document.visibilityState` before concluding the panel is slow.)
 *
 * `durationMs` MUST match the `duration-*` class on the animated node.
 */
export function usePresence(open: boolean, durationMs: number): { mounted: boolean } {
	// Always starts false so createPortal is never called during SSR or the
	// first hydration render.
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		if (open) {
			setMounted(true);
			return;
		}
		if (!mounted) return;
		const timer = setTimeout(() => setMounted(false), durationMs);
		return () => clearTimeout(timer);
	}, [open, mounted, durationMs]);

	return { mounted };
}
