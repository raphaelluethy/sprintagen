import { serve } from "bun";
import { createOpencodeServer, createOpencodeClient } from "@opencode-ai/sdk";
import index from "./index.html";

// Global OpenCode client
let opencodeClient: Awaited<ReturnType<typeof createOpencodeClient>> | null =
	null;
let opencodeServerInstance: Awaited<
	ReturnType<typeof createOpencodeServer>
> | null = null;

// Initialize OpenCode server
async function initOpencodeServer() {
	try {
		console.log("Starting OpenCode server...");
		opencodeServerInstance = await createOpencodeServer({
			hostname: "127.0.0.1",
			port: 4096,
		});
		console.log(`✅ OpenCode server running at ${opencodeServerInstance.url}`);

		opencodeClient = createOpencodeClient({
			baseUrl: opencodeServerInstance.url,
		});
		console.log("✅ OpenCode client created");
	} catch (error) {
		console.error("Failed to start OpenCode server:", error);
	}
}

// Start OpenCode server
await initOpencodeServer();

const server = serve({
	routes: {
		// Serve index.html for all unmatched routes
		"/*": index,

		// Create a new session
		"/api/session/create": {
			async POST() {
				if (!opencodeClient) {
					return Response.json(
						{ error: "OpenCode not initialized" },
						{ status: 500 },
					);
				}
				try {
					const session = await opencodeClient.session.create({
						body: { title: "OpenCode POC Session" },
					});
					return Response.json(session.data);
				} catch (error) {
					return Response.json(
						{ error: (error as Error).message },
						{ status: 500 },
					);
				}
			},
		},

		// Send a prompt to a session
		"/api/session/:id/prompt": {
			async POST(req) {
				if (!opencodeClient) {
					return Response.json(
						{ error: "OpenCode not initialized" },
						{ status: 500 },
					);
				}
				try {
					const body = await req.json();
					const result = await opencodeClient.session.prompt({
						path: { id: req.params.id },
						body: {
							agent: body.agent || "build",
							model: body.model || {
								providerID: "opencode",
								modelID: "big-pickle",
							},
							parts: body.parts,
						},
					});
					return Response.json(result.data);
				} catch (error) {
					return Response.json(
						{ error: (error as Error).message },
						{ status: 500 },
					);
				}
			},
		},

		// Get messages for a session
		"/api/session/:id/messages": {
			async GET(req) {
				if (!opencodeClient) {
					return Response.json(
						{ error: "OpenCode not initialized" },
						{ status: 500 },
					);
				}
				try {
					const messages = await opencodeClient.session.messages({
						path: { id: req.params.id },
						query: { limit: 100 },
					});
					return Response.json(messages.data);
				} catch (error) {
					return Response.json(
						{ error: (error as Error).message },
						{ status: 500 },
					);
				}
			},
		},

		// SSE endpoint for events
		"/api/events": {
			async GET() {
				if (!opencodeClient) {
					return Response.json(
						{ error: "OpenCode not initialized" },
						{ status: 500 },
					);
				}

				const client = opencodeClient; // Capture for closure

				const stream = new ReadableStream({
					async start(controller) {
						try {
							const events = await client.event.subscribe();
							for await (const event of events.stream) {
								const data = `data: ${JSON.stringify(event)}\n\n`;
								controller.enqueue(new TextEncoder().encode(data));
							}
						} catch (error) {
							console.error("Event stream error:", error);
							controller.close();
						}
					},
				});

				return new Response(stream, {
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						Connection: "keep-alive",
					},
				});
			},
		},
	},

	development: process.env.NODE_ENV !== "production" && {
		// Enable browser hot reloading in development
		hmr: true,

		// Echo console logs from the browser to the server
		console: true,
	},
});

console.log(`🚀 Server running at ${server.url}`);
