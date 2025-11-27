import { NextResponse } from "next/server";
import { fetchFromOpencode } from "@/lib/opencode";

/**
 * GET /api/opencode/agents - List all available agents
 * Proxies to GET /agent endpoint as documented in:
 * https://github.com/sst/opencode/blob/main/packages/web/src/content/docs/server.mdx
 *
 * Returns array of Agent.Info objects with fields: { name, description?, mode?, builtIn? }
 */
export async function GET() {
    try {
        const response = await fetchFromOpencode("/agent", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Opencode server returned ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return NextResponse.json(
            { error: `Failed to fetch agents: ${message}` },
            { status: 500 }
        );
    }
}
