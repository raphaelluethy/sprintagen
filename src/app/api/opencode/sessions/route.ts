import { NextResponse } from "next/server";
import { fetchFromOpencode } from "@/lib/opencode";

/**
 * GET /api/opencode/sessions - List all sessions
 * Proxies to GET /session endpoint as documented in:
 * https://github.com/sst/opencode/blob/main/packages/web/src/content/docs/server.mdx
 */
export async function GET() {
    try {
        const response = await fetchFromOpencode("/session", {
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
            { error: `Failed to fetch sessions: ${message}` },
            { status: 500 }
        );
    }
}

/**
 * POST /api/opencode/sessions - Create a new session
 * Proxies to POST /session endpoint as documented in:
 * https://github.com/sst/opencode/blob/main/packages/web/src/content/docs/server.mdx
 *
 * Accepts optional body: { title?, parentID? }
 * Returns the created Session.Info object.
 * Note: Upstream returns 200, not 201, so we forward the actual status code.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));

        const response = await fetchFromOpencode("/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json(
                {
                    error: `Opencode server returned ${response.status}: ${errorText}`,
                },
                { status: response.status }
            );
        }

        const data = await response.json();
        // Forward the upstream status code (200) instead of forcing 201
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return NextResponse.json(
            { error: `Failed to create session: ${message}` },
            { status: 500 }
        );
    }
}
