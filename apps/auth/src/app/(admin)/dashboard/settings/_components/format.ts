export function formatDate(iso: string | null): string {
	if (!iso) return "Never";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "Unknown";
	return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
