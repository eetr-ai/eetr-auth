import { NextResponse } from "next/server";
import { withApiContext } from "@/lib/context/with-api-context";

function parseBearerToken(authorizationHeader: string | null): string | null {
	if (!authorizationHeader) return null;
	const [scheme, value] = authorizationHeader.split(" ");
	if (!scheme || !value) return null;
	if (scheme.toLowerCase() !== "bearer") return null;
	const token = value.trim();
	return token.length > 0 ? token : null;
}

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

function buildValidationResponse(payload: {
	valid: boolean;
	active: boolean;
	clientId: string | null;
	expiresAt: string | null;
}) {
	return {
		valid: payload.valid,
		active: payload.active,
		client_id: payload.clientId,
		expires_at: payload.expiresAt,
	};
}

function scheduleActivityLog(
	ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined,
	logPromise: Promise<void>
) {
	ctx?.waitUntil?.(logPromise.catch((err) => console.error("[token_activity_log]", err)));
}

export const POST = withApiContext(async (req, ctx, getServices) => {
	const startMs = Date.now();
	const ip = req.headers.get("CF-Connecting-IP") ?? null;
	const { oauthTokenService, tokenActivityLogService } = getServices();

	let token: string | null = parseBearerToken(req.headers.get("authorization"));
	let scopes: string[] = [];
	let environmentName: string | null = null;

	const contentType = req.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		const body = (await req.json()) as {
			token?: unknown;
			scopes?: unknown;
			environmentName?: unknown;
		};
		if (!token) {
			token = typeof body.token === "string" ? body.token : null;
		}
		scopes = normalizeScopes(body.scopes);
		environmentName =
			typeof body.environmentName === "string" ? body.environmentName.trim() : null;
	} else {
		const body = await req.formData();
		const tokenEntry = body.get("token");
		const scopesEntry = body.getAll("scopes");
		const environmentEntry = body.get("environmentName");
		if (!token) {
			token = typeof tokenEntry === "string" ? tokenEntry : null;
		}
		if (scopesEntry.length > 0) {
			scopes = normalizeScopes(scopesEntry.length === 1 ? scopesEntry[0] : scopesEntry);
		}
		environmentName =
			typeof environmentEntry === "string" ? environmentEntry.trim() : null;
	}

	if (!environmentName || environmentName.length === 0) {
		const durationMs = Date.now() - startMs;
		scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
			ip,
			requestType: "validate",
			succeeded: false,
			environmentName: null,
			durationMs,
		}));
		return NextResponse.json(
			buildValidationResponse({
				valid: false,
				active: false,
				clientId: null,
				expiresAt: null,
			}),
			{
				status: 401,
				headers: {
					"Cache-Control": "no-store",
					Pragma: "no-cache",
				},
			}
		);
	}
	const validation = await oauthTokenService.validateAccessToken(
		token,
		scopes,
		environmentName
	);

	if (!validation.valid) {
		const durationMs = Date.now() - startMs;
		scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
			ip,
			requestType: "validate",
			succeeded: false,
			environmentName,
			durationMs,
		}));
		return NextResponse.json(
			buildValidationResponse({
				valid: false,
				active: validation.active,
				clientId: null,
				expiresAt: null,
			}),
			{
				status: 401,
				headers: {
					"Cache-Control": "no-store",
					Pragma: "no-cache",
				},
			}
		);
	}

	const durationMs = Date.now() - startMs;
	scheduleActivityLog(ctx.ctx, tokenActivityLogService.logActivity({
		ip,
		requestType: "validate",
		succeeded: true,
		environmentName,
		durationMs,
	}));
	return NextResponse.json(
		buildValidationResponse({
			valid: true,
			active: validation.active,
			clientId: validation.clientId,
			expiresAt: validation.expiresAt,
		}),
		{
			status: 200,
			headers: {
				"Cache-Control": "no-store",
				Pragma: "no-cache",
			},
		}
	);
});
