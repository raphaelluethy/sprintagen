import { NextResponse } from "next/server";
import { env } from "@/env";
import { getOpencodeClient } from "@/lib/opencode-client";

type HealthStatus = "healthy" | "unhealthy" | "unavailable";

type HealthPayload = {
	status: HealthStatus;
	message?: string;
};

export async function GET() {
	if (!env.OPENCODE_SERVER_URL) {
		return NextResponse.json<HealthPayload>({
			status: "unavailable",
			message: "OPENCODE_SERVER_URL not configured",
		});
	}

	try {
		const client = getOpencodeClient();
		const result = await client.app.agents();

		if (result.data) {
			return NextResponse.json<HealthPayload>({ status: "healthy" });
		}

		const status = result.response?.status ?? 500;
		return NextResponse.json<HealthPayload>(
			{
				status: "unhealthy",
				message: `Opencode server returned ${status}`,
			},
			{ status },
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return NextResponse.json<HealthPayload>(
			{
				status: "unavailable",
				message: `Opencode server not reachable at ${env.OPENCODE_SERVER_URL}: ${message}`,
			},
			{ status: 503 },
		);
	}
}
