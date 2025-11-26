import { NextResponse } from "next/server";
import { env } from "@/env";

// Helper to configure auth with opencode server
async function configureProviderAuth(providerId: string, apiKey: string) {
	const serverUrl = env.OPENCODE_SERVER_URL;
	if (!serverUrl) {
		throw new Error("OPENCODE_SERVER_URL not configured");
	}

	const response = await fetch(`${serverUrl}/provider/${providerId}/api-key`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ key: apiKey }),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Failed to configure auth: ${errorText}`);
	}

	return true;
}

// GET /api/opencode/auth - Auto-configure auth from env vars
export async function GET() {
	const serverUrl = env.OPENCODE_SERVER_URL;

	if (!serverUrl) {
		return NextResponse.json(
			{ error: "OPENCODE_SERVER_URL not configured" },
			{ status: 503 },
		);
	}

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
	const serverUrl = env.OPENCODE_SERVER_URL;

	if (!serverUrl) {
		return NextResponse.json(
			{ error: "OPENCODE_SERVER_URL not configured" },
			{ status: 503 },
		);
	}

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
