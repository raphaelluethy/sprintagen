import { NextResponse } from "next/server";
import { fetchFromOpencode } from "@/lib/opencode";

/**
 * GET /api/opencode/providers - List available AI providers
 * Proxies to GET /config/providers endpoint as documented in:
 * https://github.com/sst/opencode/blob/main/packages/web/src/content/docs/server.mdx
 *
 * Transforms the response from { providers: Provider[], default: Record<string,string> }
 * into an array format that the UI expects: { id, name, models? }[]
 */
export async function GET() {
    try {
        const response = await fetchFromOpencode("/config/providers", {
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

        // Transform the response to match UI expectations
        // Upstream returns: { providers: Provider[], default: Record<string,string> }
        // UI expects: Array<{ id: string, name: string, models?: { id: string, name: string }[] }>
        const providers = Array.isArray(data.providers) ? data.providers : [];
        const transformed = providers.map((provider: any) => ({
            id: provider.id,
            name: provider.name,
            models: provider.models
                ? Object.entries(provider.models).map(
                      ([id, model]: [string, any]) => ({
                          id,
                          name: model.name || id,
                      })
                  )
                : undefined,
        }));

        return NextResponse.json(transformed);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return NextResponse.json(
            { error: `Failed to fetch providers: ${message}` },
            { status: 500 }
        );
    }
}
