import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

export interface CardProps {
	children: ReactNode;
	className?: string;
}

/** Bare card wrapper: rounded-xl muted border. For boxes without a heading. */
export function Card({ children, className }: CardProps) {
	return (
		<div className={cn("rounded-xl border border-brand-muted p-6", className)}>{children}</div>
	);
}

export interface SectionCardProps {
	title: string;
	icon: LucideIcon;
	children: ReactNode;
	className?: string;
}

/** Titled section card. Every heading takes a leading lucide icon at h-5 w-5. */
export function SectionCard({ title, icon: Icon, children, className }: SectionCardProps) {
	return (
		<section className={cn("rounded-xl border border-brand-muted p-6", className)}>
			<h2 className="mb-4 flex items-center gap-2 text-lg font-medium">
				<Icon className="h-5 w-5" />
				{title}
			</h2>
			{children}
		</section>
	);
}
