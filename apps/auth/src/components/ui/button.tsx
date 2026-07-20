import type { ButtonHTMLAttributes } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "destructiveConfirm";

/** Variant → class strings, taken verbatim from apps/docs/content/docs/contributing/ux-guidelines.mdx. */
export const buttonVariants: Record<ButtonVariant, string> = {
	primary:
		"rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-muted disabled:opacity-50",
	secondary:
		"rounded-full border border-brand-muted px-4 py-2 text-sm font-medium hover:bg-brand-muted/30 disabled:opacity-50",
	destructiveConfirm:
		"inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-900/60",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	/** When true, the leading icon is replaced by a spinner and the button is disabled. */
	loading?: boolean;
	/** Optional leading lucide icon. Adds `flex items-center gap-2` so the label aligns. */
	icon?: LucideIcon;
}

/**
 * Pill-shaped button. Pass `className` for layout-only additions (e.g. `w-full`,
 * focus rings) — variant classes always win for color/shape.
 */
export function Button({
	variant = "primary",
	loading = false,
	icon: Icon,
	disabled,
	className,
	children,
	...rest
}: ButtonProps) {
	const hasLeading = loading || Boolean(Icon);
	return (
		<button
			{...rest}
			disabled={disabled || loading}
			className={cn(
				buttonVariants[variant],
				hasLeading && "flex items-center gap-2",
				className,
			)}
		>
			{loading ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : Icon ? (
				<Icon className="h-4 w-4" />
			) : null}
			{children}
		</button>
	);
}
