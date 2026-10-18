"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

const options: { value: Theme; label: string; icon: typeof Sun }[] = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "system", label: "System", icon: Monitor },
	{ value: "dark", label: "Dark", icon: Moon },
];

// Resolve the preference to a concrete light/dark class on <html>. Mirrors the
// inline pre-paint script in layout.tsx so they stay in sync.
function applyTheme(theme: Theme) {
	const dark =
		theme === "dark" ||
		(theme === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);
	const root = document.documentElement.classList;
	root.toggle("dark", dark);
	root.toggle("light", !dark);
}

// localStorage is the store; `choose` notifies after writing so every mounted switcher
// re-reads it. Cross-tab `storage` events are not followed, as before.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function readStoredTheme(): Theme {
	return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
}

// Unknown during SSR and hydration, so no option renders as active until the client
// snapshot takes over and the server and client first renders match.
function readServerTheme(): Theme | null {
	return null;
}

export function ThemeSwitcher() {
	const theme = useSyncExternalStore(subscribe, readStoredTheme, readServerTheme);

	// Keep following the OS while "system" is selected.
	useEffect(() => {
		if (theme !== "system") return;
		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, [theme]);

	function choose(next: Theme) {
		localStorage.setItem(STORAGE_KEY, next);
		applyTheme(next);
		for (const listener of listeners) listener();
	}

	return (
		<div
			role="group"
			aria-label="Theme"
			className="inline-flex items-center gap-0.5 rounded-full border border-border p-0.5"
		>
			{options.map(({ value, label, icon: Icon }) => {
				const isActive = theme === value;
				return (
					<button
						key={value}
						type="button"
						onClick={() => choose(value)}
						aria-label={label}
						aria-pressed={isActive}
						title={label}
						className={`inline-flex items-center justify-center rounded-full p-1.5 transition-colors ${
							isActive
								? "bg-surface-sunken text-foreground"
								: "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
						}`}
					>
						<Icon className="h-4 w-4" />
					</button>
				);
			})}
		</div>
	);
}
