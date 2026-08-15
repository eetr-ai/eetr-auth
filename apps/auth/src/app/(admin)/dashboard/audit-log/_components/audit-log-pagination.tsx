interface AuditLogPaginationProps {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
	onPrev: () => void;
	onNext: () => void;
}

export function AuditLogPagination({
	page,
	pageSize,
	total,
	totalPages,
	onPrev,
	onNext,
}: AuditLogPaginationProps) {
	return (
		<div className="mt-4 flex shrink-0 items-center justify-between text-sm text-muted-foreground">
			<span>
				Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
			</span>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={onPrev}
					disabled={page === 0}
					className="rounded border border-border px-2 py-1 hover:bg-surface-hover disabled:opacity-50"
				>
					Previous
				</button>
				<button
					type="button"
					onClick={onNext}
					disabled={page >= totalPages - 1}
					className="rounded border border-border px-2 py-1 hover:bg-surface-hover disabled:opacity-50"
				>
					Next
				</button>
			</div>
		</div>
	);
}
