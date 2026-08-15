import {
	Ban,
	CalendarClock,
	CalendarPlus,
	CircleCheck,
	CircleX,
	KeyRound,
	RefreshCw,
	type LucideIcon,
} from "lucide-react";
import type { TokenActivityItem } from "./types";

/**
 * Icon + tooltip pairs for the token table.
 *
 * The table has to fit ten attributes per token, so type, status and the two
 * timestamps are carried by glyphs. Each one keeps its wording in a `title` and
 * an `aria-label`, so the meaning is never colour- or shape-only.
 */

interface GlyphProps {
	icon: LucideIcon;
	label: string;
	className?: string;
}

export function Glyph({ icon: Icon, label, className }: GlyphProps) {
	return (
		<span title={label} aria-label={label} role="img" className="inline-flex shrink-0">
			<Icon className={`h-4 w-4 ${className ?? "text-muted-foreground"}`} />
		</span>
	);
}

const TOKEN_TYPE: Record<TokenActivityItem["tokenType"], { icon: LucideIcon; label: string }> = {
	access: { icon: KeyRound, label: "Access token" },
	refresh: { icon: RefreshCw, label: "Refresh token" },
};

export function TokenTypeGlyph({ type }: { type: TokenActivityItem["tokenType"] }) {
	const { icon, label } = TOKEN_TYPE[type];
	return <Glyph icon={icon} label={label} />;
}

/**
 * Three states, read at a glance: a green check means usable, a red ban means
 * someone revoked it, and a muted cross means it simply aged out. A clock here
 * was ambiguous — it reads as "pending" as easily as "expired".
 */
const TOKEN_STATUS: Record<
	TokenActivityItem["status"],
	{ icon: LucideIcon; label: string; className: string }
> = {
	active: { icon: CircleCheck, label: "Active", className: "text-success-icon" },
	expired: { icon: CircleX, label: "Expired", className: "text-muted-foreground" },
	revoked: { icon: Ban, label: "Revoked", className: "text-danger-icon" },
};

export function TokenStatusGlyph({ status }: { status: TokenActivityItem["status"] }) {
	const { icon, label, className } = TOKEN_STATUS[status];
	return <Glyph icon={icon} label={label} className={className} />;
}

/** One timestamp line: an icon that says which date this is, then the date. */
export function DateLine({
	kind,
	value,
}: {
	kind: "created" | "expires";
	value: string | null;
}) {
	const { icon, label } =
		kind === "created"
			? { icon: CalendarPlus, label: "Created" }
			: { icon: CalendarClock, label: "Expires" };

	return (
		<span className="flex items-center gap-1.5 whitespace-nowrap">
			<Glyph icon={icon} label={label} />
			<span className={value ? undefined : "text-muted-foreground"}>
				{value ? new Date(value).toLocaleString() : "—"}
			</span>
		</span>
	);
}
