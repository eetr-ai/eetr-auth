import { NextResponse } from "next/server";
import { getOpenApiDocument } from "@/lib/openapi/spec";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	const { origin } = new URL(req.url);
	return NextResponse.json(getOpenApiDocument(origin));
}