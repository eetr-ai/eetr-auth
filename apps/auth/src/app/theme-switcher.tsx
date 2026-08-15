"use client";

import { useEffect, useState } from "react";
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

export function ThemeSwitcher() {
	const [theme, setTheme] = useState<Theme>("system");
	// Gate the active highlight on mount so server/client first render match
	// (the real preference lives in localStorage, unknown during SSR).
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
		setTheme(stored);
		setMounted(true);
	}, []);

	// Keep following the OS while "system" is selected.
	useEffect(() => {
		if (theme !== "system") return;
		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, [theme]);

	function choose(next: Theme) {
		setTheme(next);
		localStorage.setItem(STORAGE_KEY, next);
		applyTheme(next);
	}

	return (
		<div
			role="group"
			aria-label="Theme"
			className="inline-flex items-center gap-0.5 rounded-full border border-border p-0.5"
		>
			{options.map(({ value, label, icon: Icon }) => {
				const isActive = mounted && theme === value;
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
