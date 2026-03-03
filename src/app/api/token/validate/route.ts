import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";

function normalizeScopes(value: unknown): string[] {
	if (Array.isArray(value)) {
		return Array.from(
			new Set(value.filter((item): item is string => typeof item === "string").map((s) => s.trim()).filter(Boolean))
		);
	}
	if (typeof value === "string") {
		return Array.from(new Set(value.split(/\s+/).map((s) => s.trim()).filter(Boolean)));
	}
	return [];
}

export const POST = withApiContext(async (req, _ctx, getServices) => {
	let token: string | null = null;
	let scopes: string[] = [];

	const contentType = req.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		const body = (await req.json()) as { token?: unknown; scopes?: unknown };
		token = typeof body.token === "string" ? body.token : null;
		scopes = normalizeScopes(body.scopes);
	} else {
		const body = await req.formData();
		const tokenEntry = body.get("token");
		const scopesEntry = body.getAll("scopes");
		token = typeof tokenEntry === "string" ? tokenEntry : null;
		if (scopesEntry.length > 0) {
			scopes = normalizeScopes(scopesEntry.length === 1 ? scopesEntry[0] : scopesEntry);
		}
	}

	const { oauthTokenService } = getServices();
	const validation = await oauthTokenService.validateAccessToken(token, scopes);

	return NextResponse.json(validation, {
		status: validation.valid ? 200 : 401,
		headers: {
			"Cache-Control": "no-store",
			Pragma: "no-cache",
		},
	});
});
