import type { ReactNode } from "react";
import { cn } from "./cn";

export type BannerVariant = "error" | "success" | "info" | "warning";

const bannerVariants: Record<BannerVariant, string> = {
	error: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-200",
	success: "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-200",
	warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200",
	info: "bg-brand-muted/30 text-foreground",
};

export interface BannerProps {
	variant: BannerVariant;
	/** Renders nothing when falsy, so call sites can pass nullable state directly. */
	message: ReactNode | null | undefined;
	className?: string;
}

/** Inline status banner. Lives inside the section it relates to (no toasts). */
export function Banner({ variant, message, className }: BannerProps) {
	if (!message) return null;
	return (
		<p className={cn("mb-3 rounded-xl px-3 py-2 text-sm", bannerVariants[variant], className)}>
			{message}
		</p>
	);
}
