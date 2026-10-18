import { useEffect, useRef } from "react";

/**
 * A ref that always holds the latest committed `value`, for code that runs outside render:
 * unmount cleanups, async callbacks that must not act on a stale panel, and event handlers
 * we do not want to re-subscribe when their closure changes.
 *
 * The write happens in an effect rather than during render, which is what the React
 * Compiler rules ask for: render stays pure, and by the time any of those readers run the
 * effect has already committed the new value.
 */
export function useLatestRef<T>(value: T) {
	const ret = useRef(value);
	useEffect(() => {
		ret.current = value;
	}, [value]);
	return ret;
}
