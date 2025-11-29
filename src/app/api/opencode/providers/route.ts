import { NextResponse } from "next/server";
import { getOpencodeClient } from "@/lib/opencode-client";

type ErrorPayload = { error: string; details?: unknown };

function buildErrorResponse(payload: ErrorPayload, status: number) {
	return NextResponse.json(payload, { status });
}

export async function GET() {
	try {
		const client = getOpencodeClient();
		const result = await client.config.providers();

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

		const providers = Array.isArray(result.data.providers)
			? result.data.providers
			: [];

		const transformed = providers.map((provider) => ({
			id: provider.id,
			name: provider.name,
			models: provider.models
				? Object.entries(provider.models).map(([id, model]) => ({
						id,
						name: model.name ?? id,
					}))
				: undefined,
		}));

		return NextResponse.json(transformed, { status: result.response?.status });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return buildErrorResponse(
			{ error: `Failed to fetch providers: ${message}` },
			500,
		);
	}
}
