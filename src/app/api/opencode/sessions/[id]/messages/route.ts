import { NextResponse } from "next/server";
import { fetchFromOpencode } from "@/lib/opencode";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/opencode/sessions/[id]/messages - List messages for a session
 * Proxies to GET /session/:id/message endpoint as documented in:
 * https://github.com/sst/opencode/blob/main/packages/web/src/content/docs/server.mdx
 *
 * Returns array of { info: Message, parts: Part[] } objects.
 */
export async function GET(_request: Request, context: RouteParams) {
    const { id } = await context.params;

    try {
        const response = await fetchFromOpencode(`/session/${id}/message`, {
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
            { error: `Failed to fetch messages: ${message}` },
            { status: 500 }
        );
    }
}

/**
 * POST /api/opencode/sessions/[id]/messages - Send a chat message to a session
 * Proxies to POST /session/:id/message endpoint as documented in:
 * https://github.com/sst/opencode/blob/main/packages/web/src/content/docs/server.mdx
 *
 * Body should match SessionPrompt.PromptInput.omit({ sessionID: true }):
 * { agent?, model?: { providerID, modelID }, parts: Part[], noReply?, system?, tools? }
 *
 * Returns { info: Message, parts: Part[] } with the created assistant message.
 * Note: Upstream returns 200 (streaming JSON), not 201, so we forward the actual status code.
 */
export async function POST(request: Request, context: RouteParams) {
    const { id } = await context.params;

    try {
        const body = await request.json();

        const response = await fetchFromOpencode(`/session/${id}/message`, {
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
            { error: `Failed to send message: ${message}` },
            { status: 500 }
        );
    }
}
