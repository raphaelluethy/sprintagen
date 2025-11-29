import { NextResponse } from "next/server";
import { getOpencodeClient } from "@/lib/opencode-client";

type ErrorPayload = { error: string; details?: unknown };

function buildErrorResponse(payload: ErrorPayload, status: number) {
	return NextResponse.json(payload, { status });
}

export async function GET() {
	try {
		const client = getOpencodeClient();
		const result = await client.app.agents();

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
			{ error: `Failed to fetch agents: ${message}` },
			500,
		);
	}
}
