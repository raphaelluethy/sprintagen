import { NextResponse } from "next/server";
import { env } from "@/env";

// GET /api/opencode/providers - List available AI providers
export async function GET() {
	const serverUrl = env.OPENCODE_SERVER_URL;

	if (!serverUrl) {
		return NextResponse.json(
			{ error: "OPENCODE_SERVER_URL not configured" },
			{ status: 503 },
		);
	}

	try {
		const response = await fetch(`${serverUrl}/config/providers`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			return NextResponse.json(
				{ error: `Opencode server returned ${response.status}` },
				{ status: response.status },
			);
		}

		const data = await response.json();
		return NextResponse.json(data);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return NextResponse.json(
			{ error: `Failed to fetch providers: ${message}` },
			{ status: 500 },
		);
	}
}
