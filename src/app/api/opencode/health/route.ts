import { NextResponse } from "next/server";
import { env } from "@/env";

export async function GET() {
	const serverUrl = env.OPENCODE_SERVER_URL;

	if (!serverUrl) {
		return NextResponse.json(
			{ status: "error", message: "OPENCODE_SERVER_URL not configured" },
			{ status: 503 },
		);
	}

	try {
		const response = await fetch(`${serverUrl}/app`, {
			method: "GET",
			signal: AbortSignal.timeout(5000),
		});

		if (!response.ok) {
			return NextResponse.json(
				{
					status: "unhealthy",
					message: `Opencode server returned ${response.status}`,
				},
				{ status: 503 },
			);
		}

		const data = await response.json();
		return NextResponse.json({ status: "healthy", data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return NextResponse.json(
			{
				status: "error",
				message: `Failed to connect to opencode server: ${message}`,
			},
			{ status: 503 },
		);
	}
}
