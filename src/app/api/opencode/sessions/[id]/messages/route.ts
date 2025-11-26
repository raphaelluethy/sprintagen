import { NextResponse } from "next/server";
import { env } from "@/env";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteParams) {
	const serverUrl = env.OPENCODE_SERVER_URL;
	const { id } = await context.params;

	if (!serverUrl) {
		return NextResponse.json(
			{ error: "OPENCODE_SERVER_URL not configured" },
			{ status: 503 },
		);
	}

	try {
		const response = await fetch(`${serverUrl}/session/${id}/message`, {
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
			{ error: `Failed to fetch messages: ${message}` },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request, context: RouteParams) {
	const serverUrl = env.OPENCODE_SERVER_URL;
	const { id } = await context.params;

	if (!serverUrl) {
		return NextResponse.json(
			{ error: "OPENCODE_SERVER_URL not configured" },
			{ status: 503 },
		);
	}

	try {
		const body = await request.json();

		// The body should match the ChatInput schema from Opencode's OpenAPI spec
		// Typically: { content: string, ... }
		const response = await fetch(`${serverUrl}/session/${id}/message`, {
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
			{ error: `Failed to send message: ${message}` },
			{ status: 500 },
		);
	}
}
