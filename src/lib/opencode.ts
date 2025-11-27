import { env } from "@/env";

/**
 * Get the Opencode server URL, with Docker service name fallback.
 * In Docker, localhost/127.0.0.1 won't work - need to use the service name.
 */
export function getOpencodeUrl(): string {
    const serverUrl = env.OPENCODE_SERVER_URL;
    if (!serverUrl) {
        throw new Error("OPENCODE_SERVER_URL not configured");
    }
    return serverUrl;
}

/**
 * Get list of URLs to try for Opencode server.
 * Includes Docker service name fallback for containerized environments.
 */
export function getOpencodeUrls(): string[] {
    const serverUrl = env.OPENCODE_SERVER_URL;
    if (!serverUrl) {
        return [];
    }

    const urls = [serverUrl];
    // In Docker, services communicate via service names
    if (serverUrl.includes("localhost") || serverUrl.includes("127.0.0.1")) {
        urls.push(serverUrl.replace(/localhost|127\.0\.0\.1/, "opencode"));
    }
    return urls;
}

/**
 * Fetch from Opencode server with automatic Docker fallback.
 *
 * Optionally supports directory scoping via OPENCODE_DIRECTORY env var or
 * the `directory` option. When set, adds the directory as a query parameter
 * or x-opencode-directory header as per opencode serve API spec.
 *
 * @param path - API path (e.g., "/session", "/agent")
 * @param options - Fetch options, can include `directory?: string` for scoping
 */
export async function fetchFromOpencode(
    path: string,
    options?: RequestInit & { directory?: string }
): Promise<Response> {
    const urls = getOpencodeUrls();

    if (urls.length === 0) {
        throw new Error("OPENCODE_SERVER_URL not configured");
    }

    // Extract directory from options if provided, or check env var
    const directory = options?.directory ?? process.env.OPENCODE_DIRECTORY;
    const { directory: _, ...fetchOptions } = options ?? {};

    // Build URL with optional directory query parameter
    const buildUrl = (baseUrl: string, p: string) => {
        const url = new URL(p, baseUrl);
        if (directory) {
            url.searchParams.set("directory", directory);
        }
        return url.toString();
    };

    // Build headers with optional directory header
    const headers = new Headers(fetchOptions.headers);
    if (directory && !headers.has("x-opencode-directory")) {
        headers.set("x-opencode-directory", directory);
    }

    let lastError: Error | null = null;

    for (let i = 0; i < urls.length; i++) {
        const baseUrl = urls[i];
        const isLastUrl = i === urls.length - 1;

        try {
            const fullUrl = buildUrl(baseUrl, path);
            console.log(`[Opencode] Trying: ${fullUrl}`);

            // For fallback URLs (not the last one), use a short timeout to quickly
            // detect connection failures. For the last URL (or if caller provided
            // their own signal), use that instead - LLM requests can take a long time.
            const signal = fetchOptions.signal
                ? fetchOptions.signal
                : !isLastUrl
                  ? AbortSignal.timeout(2000)
                  : undefined;

            const response = await fetch(fullUrl, {
                ...fetchOptions,
                headers,
                signal,
            });
            console.log(`[Opencode] Success: ${fullUrl}`);
            return response;
        } catch (error) {
            console.log(`[Opencode] Failed: ${buildUrl(baseUrl, path)}`, error);
            lastError =
                error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError ?? new Error("Failed to connect to Opencode server");
}
