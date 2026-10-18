import { useEffect, useState, useSyncExternalStore } from "react";

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
 * The exit classes MUST include `fill-mode-forwards`. tw-animate-css defaults to
 * `animation-fill-mode: none`, so the moment the exit animation ends the node snaps
 * back to fully visible -- and it stays that way until this timer unmounts it, which
 * starts a little after the animation does. That gap shows as a one-frame blink.
 *
 * `durationMs` MUST match the `duration-*` class on the animated node.
 */
export function usePresence(open: boolean, durationMs: number): { mounted: boolean } {
	// False on the server and through the hydration render, true from then on, so
	// createPortal is never called during SSR or the first hydration render.
	const hydrated = useSyncExternalStore(subscribeNever, isClient, isServer);

	// `lingering` covers the exit window after `open` drops. It is adjusted during render
	// when `open` flips (React's pattern for state that tracks a prop) rather than in an
	// effect, so the overlay does not paint one frame unmounted on the way up. Reopening
	// mid-exit clears it, which also cancels the pending timer below.
	const [lingering, setLingering] = useState(false);
	const [prevOpen, setPrevOpen] = useState(open);
	if (prevOpen !== open) {
		setPrevOpen(open);
		setLingering(!open);
	}

	useEffect(() => {
		if (!lingering) return;
		const timer = setTimeout(() => setLingering(false), durationMs);
		return () => clearTimeout(timer);
	}, [lingering, durationMs]);

	return { mounted: hydrated && (open || lingering) };
}

// Nothing to subscribe to: the value only changes between the server/hydration
// snapshot and the client one, which useSyncExternalStore handles on its own.
function subscribeNever() {
	return () => {};
}
function isClient() {
	return true;
}
function isServer() {
	return false;
}
