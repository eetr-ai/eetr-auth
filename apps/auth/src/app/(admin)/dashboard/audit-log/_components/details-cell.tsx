import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function formatDetails(raw: string | null): string | null {
	if (!raw) return null;
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}

export function DetailsCell({ raw }: { raw: string | null }) {
	const [open, setOpen] = useState(false);
	const pretty = formatDetails(raw);
	if (!pretty) return <span className="text-muted-foreground">—</span>;
	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
			>
				{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
				{open ? "Hide" : "Show"}
			</button>
			{open && (
				<pre className="max-w-md overflow-x-auto rounded-lg border border-brand-muted bg-brand-muted/10 p-2 font-mono text-xs">
					{pretty}
				</pre>
			)}
		</div>
	);
}
