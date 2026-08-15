import { redirect } from "next/navigation";

/**
 * The client detail page is retired: everything it held is now in the side
 * panel on /dashboard/clients, except the issued-token list, which moved to
 * /dashboard/tokens behind a client filter.
 *
 * The route survives as a redirect so existing links and bookmarks keep
 * working and land on the same client, now in the panel.
 */
export default async function ClientDetailRedirect({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	redirect(`/dashboard/clients?client=${encodeURIComponent(id)}`);
}
