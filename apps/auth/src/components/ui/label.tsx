import type { HTMLAttributes, LabelHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Every form label in the app takes its look from here, so a style change is one
 * edit. See the Forms section of apps/docs/content/docs/contributing/ux-guidelines.mdx.
 *
 * - `field`: the label above a control. It must read as a label at a glance, never in
 *   the grey used for help text and placeholders.
 * - `compact`: the same, sized for dense filter toolbars.
 * - `sub`: a secondary label inside a grouped field (e.g. "URL" under "Home link").
 */
export type LabelVariant = "field" | "compact" | "sub";

export const labelVariants: Record<LabelVariant, string> = {
	field: "block text-sm font-medium text-foreground",
	compact: "block text-xs font-medium text-foreground",
	sub: "block text-xs text-muted-foreground",
};

interface LabelStyleProps {
	variant?: LabelVariant;
	/** Drop the bottom margin, for containers that already space their children (`space-y-*`). */
	flush?: boolean;
}

function labelClass(variant: LabelVariant, flush: boolean, className?: string): string {
	return cn(labelVariants[variant], !flush && "mb-1", className);
}

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & LabelStyleProps;

/** A `<label>` element, for a label that points at its control with `htmlFor`. */
export function Label({ variant = "field", flush = false, className, children, ...rest }: LabelProps) {
	return (
		<label className={labelClass(variant, flush, className)} {...rest}>
			{children}
		</label>
	);
}

export type LabelTextProps = HTMLAttributes<HTMLSpanElement> & LabelStyleProps;

/**
 * The label's text as a `<span>`, for a `<label>` that wraps its control (or a
 * heading over a group of checkboxes that has no single control to point at).
 */
export function LabelText({ variant = "field", flush = false, className, children, ...rest }: LabelTextProps) {
	return (
		<span className={labelClass(variant, flush, className)} {...rest}>
			{children}
		</span>
	);
}
