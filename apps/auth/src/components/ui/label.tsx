import type { LabelHTMLAttributes } from "react";
import { cn } from "./cn";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

/** Form label. Base style matches apps/docs/content/docs/contributing/ux-guidelines.mdx. */
export function Label({ className, children, ...rest }: LabelProps) {
	return (
		<label className={cn("mb-1 block text-sm text-muted-foreground", className)} {...rest}>
			{children}
		</label>
	);
}
