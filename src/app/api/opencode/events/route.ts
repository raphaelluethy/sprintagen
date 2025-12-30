import { getOpencodeClient } from "@/lib/opencode-client";
import { isEventForSession } from "@/lib/opencode-event-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint for real-time OpenCode events
 * Usage: GET /api/opencode/events?sessionId=xxx
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const sessionId = url.searchParams.get("sessionId");

	if (!sessionId) {
		return new Response("Missing sessionId query parameter", { status: 400 });
	}

	const client = getOpencodeClient();
	const encoder = new TextEncoder();

	console.log(`[SSE] Starting event stream for session ${sessionId}`);

	const stream = new ReadableStream({
		async start(controller) {
			const abortController = new AbortController();

			// Cleanup when client disconnects
			request.signal.addEventListener("abort", () => {
				console.log(`[SSE] Client disconnected from session ${sessionId}`);
				abortController.abort();
			});

			try {
				// Send initial connection event
				const connectEvent = `data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`;
				controller.enqueue(encoder.encode(connectEvent));

				// Fetch and send initial session state
				const [messagesResult, statusResult] = await Promise.all([
					client.session.messages({ path: { id: sessionId } }),
					client.session.status(),
				]);

				// Send initial messages
				if (messagesResult.data) {
					for (const msg of messagesResult.data) {
						// Send message.updated event
						const msgEvent = `data: ${JSON.stringify({
							type: "message.updated",
							properties: { info: msg.info },
						})}\n\n`;
						controller.enqueue(encoder.encode(msgEvent));

						// Send message.part.updated events for each part
						for (const part of msg.parts ?? []) {
							const partEvent = `data: ${JSON.stringify({
								type: "message.part.updated",
								properties: { part },
							})}\n\n`;
							controller.enqueue(encoder.encode(partEvent));
						}
					}
				}

				// Send initial session status
				const sessionStatus = statusResult.data?.[sessionId];
				if (sessionStatus) {
					const statusEvent = `data: ${JSON.stringify({
						type: "session.status",
						properties: { sessionID: sessionId, status: sessionStatus },
					})}\n\n`;
					controller.enqueue(encoder.encode(statusEvent));

					// If session is already idle, send idle event
					if (sessionStatus.type === "idle") {
						const idleEvent = `data: ${JSON.stringify({
							type: "session.idle",
							properties: { sessionID: sessionId },
						})}\n\n`;
						controller.enqueue(encoder.encode(idleEvent));
					}
				}

				console.log(`[SSE] Sent initial state for session ${sessionId}`);

				// Subscribe to OpenCode events for real-time updates
				const result = await client.event.subscribe({
					signal: abortController.signal,
				});

				// Stream events filtered by sessionId
				for await (const event of result.stream) {
					if (abortController.signal.aborted) break;

					// Filter events for this session
					if (!isEventForSession(event, sessionId)) {
						continue;
					}

					// Send event to client
					const data = `data: ${JSON.stringify(event)}\n\n`;
					controller.enqueue(encoder.encode(data));

					// Debug logging for tool events
					if (
						event.type === "message.part.updated" &&
						event.properties.part.type === "tool"
					) {
						const toolPart = event.properties.part;
						console.log(
							`[SSE] Tool event for ${sessionId}:`,
							toolPart.tool,
							toolPart.state.status,
						);
					}
				}
			} catch (error) {
				if (!abortController.signal.aborted) {
					console.error(`[SSE] Fatal error for session ${sessionId}:`, error);
					const errorEvent = `data: ${JSON.stringify({ type: "error", error: String(error) })}\n\n`;
					controller.enqueue(encoder.encode(errorEvent));
				}
			} finally {
				console.log(`[SSE] Closing stream for session ${sessionId}`);
				controller.close();
			}
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
