import type { NextRequest } from "next/server";
import { createSubscriber, isRedisAvailable } from "@/server/redis";
import { getOpencodeStore, OpencodeKeys } from "@/server/redis/opencode-store";

interface RouteParams {
	params: Promise<{ id: string }>;
}

/**
 * GET /api/opencode/sessions/[id]/stream
 * Server-Sent Events endpoint for real-time session updates
 * Uses the new event-driven architecture with SDK events
 */
export async function GET(req: NextRequest, context: RouteParams) {
	const { id: sessionId } = await context.params;

	// Check if Redis is available
	if (!isRedisAvailable()) {
		return new Response(
			`data: ${JSON.stringify({ type: "error", error: "Real-time updates not available - Redis not connected" })}\n\n`,
			{
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache, no-transform",
					Connection: "keep-alive",
				},
			},
		);
	}

	// Track if stream is closed to prevent writing to closed controller
	let isClosed = false;

	// Create a readable stream for SSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			// Helper to safely enqueue data
			const sendEvent = (data: string) => {
				if (!isClosed) {
					try {
						controller.enqueue(encoder.encode(data));
					} catch (error) {
						console.error(
							`[SSE] Error enqueueing data for ${sessionId}:`,
							error,
						);
						isClosed = true;
					}
				}
			};

			// Get the store
			const store = getOpencodeStore();

			// Send initial state from the store
			try {
				const trackedSession = await store.getTrackedSession(sessionId);
				const messages = await store.getMessages(sessionId);
				const status = await store.getStatus(sessionId);

				// Get parts for all messages
				const messagesWithParts = await Promise.all(
					messages.map(async (info) => {
						const parts = await store.getParts(info.id);
						return { info, parts };
					}),
				);

				// Extract current tool calls
				const currentToolCalls = messagesWithParts
					.flatMap((m) => m.parts)
					.filter(
						(part): part is Extract<typeof part, { type: "tool" }> =>
							part.type === "tool" &&
							(part.state.status === "pending" ||
								part.state.status === "running"),
					);

				const initialState = {
					sessionId,
					ticketId: trackedSession?.ticketId,
					sessionType: trackedSession?.sessionType ?? "chat",
					status: status?.type ?? "idle",
					messages: messagesWithParts,
					currentToolCalls,
					startedAt: trackedSession?.startedAt,
					updatedAt: trackedSession?.updatedAt,
				};

				sendEvent(
					`data: ${JSON.stringify({ type: "init", state: initialState })}\n\n`,
				);
			} catch (error) {
				console.error(
					`[SSE] Error getting initial state for ${sessionId}:`,
					error,
				);
				sendEvent(
					`data: ${JSON.stringify({ type: "error", error: "Failed to get session state" })}\n\n`,
				);
			}

			// Create a new subscriber connection for this SSE stream
			const subscriber = createSubscriber();
			let heartbeatInterval: NodeJS.Timeout | null = null;

			if (!subscriber) {
				sendEvent(
					`data: ${JSON.stringify({ type: "error", error: "Failed to create Redis subscriber" })}\n\n`,
				);
				isClosed = true;
				controller.close();
				return;
			}

			try {
				// Handle Redis connection errors
				subscriber.on("error", (err) => {
					console.error(
						`[SSE] Redis subscriber error for ${sessionId}:`,
						err.message,
					);
					sendEvent(
						`data: ${JSON.stringify({ type: "error", error: "Redis connection error" })}\n\n`,
					);
				});

				// Subscribe to session events channel (from event listener)
				const channel = OpencodeKeys.sessionEvents(sessionId);
				await subscriber.subscribe(channel);

				console.log(
					`[SSE] Subscribed to channel ${channel} for session ${sessionId}`,
				);

				// Handle messages from Redis pub/sub
				subscriber.on("message", (ch, message) => {
					if (ch === channel && !isClosed) {
						try {
							const data = JSON.parse(message);
							// Forward the SDK event directly
							sendEvent(
								`data: ${JSON.stringify({ type: "event", ...data })}\n\n`,
							);
						} catch {
							// Forward raw message if not JSON
							sendEvent(`data: ${message}\n\n`);
						}
					}
				});

				// Send heartbeat every 30 seconds to keep connection alive
				heartbeatInterval = setInterval(() => {
					if (!isClosed) {
						sendEvent(`: heartbeat\n\n`);
					}
				}, 30000);
			} catch (error) {
				console.error(
					`[SSE] Failed to setup Redis subscriber for ${sessionId}:`,
					error,
				);
				sendEvent(
					`data: ${JSON.stringify({ type: "error", error: "Failed to connect to Redis" })}\n\n`,
				);
			}

			// Cleanup function
			const cleanup = () => {
				if (isClosed) return;
				isClosed = true;

				console.log(`[SSE] Cleaning up for session ${sessionId}`);

				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
					heartbeatInterval = null;
				}

				if (subscriber) {
					subscriber.unsubscribe().catch(() => {});
					subscriber.quit().catch(() => {});
				}

				try {
					controller.close();
				} catch {
					// Controller might already be closed
				}
			};

			// Handle client disconnect
			req.signal.addEventListener("abort", () => {
				console.log(`[SSE] Client disconnected for session ${sessionId}`);
				cleanup();
			});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no", // Disable nginx buffering
		},
	});
}
