import { NextResponse } from "next/server";
import { getOpencodeClient } from "@/lib/opencode-client";

interface RouteParams {
	params: Promise<{ id: string }>;
}

type ErrorPayload = { error: string; details?: unknown };

function buildErrorResponse(payload: ErrorPayload, status: number) {
	return NextResponse.json(payload, { status });
}

export async function GET(_request: Request, context: RouteParams) {
	const { id } = await context.params;

	try {
		const client = getOpencodeClient();
		const result = await client.session.messages({
			path: { id },
		});

		if (!result.data) {
			const status = result.response?.status ?? 500;
			return buildErrorResponse(
				{
					error: `Opencode server returned ${status}`,
					details: result.error,
				},
				status,
			);
		}

		return NextResponse.json(result.data, { status: result.response?.status });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return buildErrorResponse(
			{ error: `Failed to fetch messages: ${message}` },
			500,
		);
	}
}

export async function POST(request: Request, context: RouteParams) {
	const { id } = await context.params;

	try {
		const body = await request.json();
		const payload = { ...body, agent: "docs-agent" };
		const client = getOpencodeClient();
		const result = await client.session.prompt({
			path: { id },
			body: payload,
		});

		if (!result.data) {
			const status = result.response?.status ?? 500;
			return buildErrorResponse(
				{
					error: `Opencode server returned ${status}`,
					details: result.error,
				},
				status,
			);
		}

		return NextResponse.json(result.data, { status: result.response?.status });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return buildErrorResponse(
			{ error: `Failed to send message: ${message}` },
			500,
		);
	}
}
