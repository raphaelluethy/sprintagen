import { NextResponse } from "next/server";
import { env } from "@/env";

export async function GET() {
	const serverUrl = env.OPENCODE_SERVER_URL;

	if (!serverUrl) {
		return NextResponse.json(
			{ error: "OPENCODE_SERVER_URL not configured" },
			{ status: 503 },
		);
	}

	try {
		const response = await fetch(`${serverUrl}/session`, {
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
			{ error: `Failed to fetch sessions: ${message}` },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	const serverUrl = env.OPENCODE_SERVER_URL;

	if (!serverUrl) {
		return NextResponse.json(
			{ error: "OPENCODE_SERVER_URL not configured" },
			{ status: 503 },
		);
	}

	try {
		const body = await request.json().catch(() => ({}));

		const response = await fetch(`${serverUrl}/session`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errorText = await response.text();
			return NextResponse.json(
				{ error: `Opencode server returned ${response.status}: ${errorText}` },
				{ status: response.status },
			);
		}

		const data = await response.json();
		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return NextResponse.json(
			{ error: `Failed to create session: ${message}` },
			{ status: 500 },
		);
	}
}
