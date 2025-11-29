import { NextResponse } from "next/server";
import { env } from "@/env";
import { getOpencodeClient } from "@/lib/opencode-client";

async function configureProviderAuth(providerId: string, apiKey: string) {
	const client = getOpencodeClient();
	const result = await client.auth.set({
		path: { id: providerId },
		body: { type: "api", key: apiKey },
	});

	if (!result.data) {
		const status = result.response?.status ?? 500;
		const detail = result.error
			? JSON.stringify(result.error)
			: "Unknown error";
		throw new Error(`Failed to configure auth (${status}): ${detail}`);
	}

	return true;
}

// GET /api/opencode/auth - Auto-configure auth from env vars
export async function GET() {
	const providerId = env.OPENCODE_PROVIDER_ID;
	const apiKey = env.OPENCODE_PROVIDER_API_KEY;

	if (!providerId || !apiKey) {
		return NextResponse.json({
			configured: false,
			message:
				"No provider credentials in environment. Set OPENCODE_PROVIDER_ID and OPENCODE_PROVIDER_API_KEY.",
		});
	}

	try {
		await configureProviderAuth(providerId, apiKey);
		return NextResponse.json({
			configured: true,
			providerId,
			message: `API key configured for provider: ${providerId}`,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ configured: false, error: message },
			{ status: 500 },
		);
	}
}

// POST /api/opencode/auth - Set API key for a provider manually
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { providerId, key } = body;

		if (!providerId || !key) {
			return NextResponse.json(
				{ error: "Provider ID and API key are required" },
				{ status: 400 },
			);
		}

		await configureProviderAuth(providerId, key);
		return NextResponse.json({
			success: true,
			message: `API key configured for provider: ${providerId}`,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
