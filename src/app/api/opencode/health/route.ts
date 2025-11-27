import { NextResponse } from "next/server";
import { env } from "@/env";
import { fetchFromOpencode, getOpencodeUrls } from "@/lib/opencode";

/**
 * GET /api/opencode/health - Health check for opencode server
 *
 * Performs a liveness check by calling GET /agent endpoint on the opencode server.
 * This is a lightweight check that verifies the server is reachable and responding.
 *
 * Returns:
 * - { status: "healthy" } if server responds with 200
 * - { status: "unhealthy", message } if server responds with non-200
 * - { status: "unavailable", message } if server is unreachable
 */
export async function GET() {
    const urls = getOpencodeUrls();

    if (urls.length === 0) {
        return NextResponse.json({
            status: "unavailable",
            message: "OPENCODE_SERVER_URL not configured",
        });
    }

    try {
        const response = await fetchFromOpencode("/agent", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            return NextResponse.json({ status: "healthy" });
        }

        return NextResponse.json({
            status: "unhealthy",
            message: `Opencode server returned ${response.status}`,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return NextResponse.json({
            status: "unavailable",
            message: `Opencode server not reachable at ${env.OPENCODE_SERVER_URL}: ${message}`,
        });
    }
}
