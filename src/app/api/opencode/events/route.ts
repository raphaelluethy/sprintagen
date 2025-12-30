import { getOpencodeClient } from "@/lib/opencode-client";
import { isEventForSession } from "@/lib/opencode-event-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const sessionId = url.searchParams.get("sessionId");

	if (!sessionId) {
		return new Response("Missing sessionId query parameter", { status: 400 });
	}

	const client = getOpencodeClient();
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const abortController = new AbortController();

			request.signal.addEventListener("abort", () => {
				abortController.abort();
			});

			try {
				const connectEvent = `data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`;
				controller.enqueue(encoder.encode(connectEvent));

				const [messagesResult, statusResult] = await Promise.all([
					client.session.messages({ path: { id: sessionId } }),
					client.session.status(),
				]);

				if (messagesResult.data) {
					for (const msg of messagesResult.data) {
						const msgEvent = `data: ${JSON.stringify({
							type: "message.updated",
							properties: { info: msg.info },
						})}\n\n`;
						controller.enqueue(encoder.encode(msgEvent));

						for (const part of msg.parts ?? []) {
							const partEvent = `data: ${JSON.stringify({
								type: "message.part.updated",
								properties: { part },
							})}\n\n`;
							controller.enqueue(encoder.encode(partEvent));
						}
					}
				}

				const sessionStatus = statusResult.data?.[sessionId];
				if (sessionStatus) {
					const statusEvent = `data: ${JSON.stringify({
						type: "session.status",
						properties: { sessionID: sessionId, status: sessionStatus },
					})}\n\n`;
					controller.enqueue(encoder.encode(statusEvent));

					if (sessionStatus.type === "idle") {
						const idleEvent = `data: ${JSON.stringify({
							type: "session.idle",
							properties: { sessionID: sessionId },
						})}\n\n`;
						controller.enqueue(encoder.encode(idleEvent));
					}
				}

				const result = await client.event.subscribe({
					signal: abortController.signal,
				});

				for await (const event of result.stream) {
					if (abortController.signal.aborted) break;

					if (controller.desiredSize === null) {
						break;
					}

					if (!isEventForSession(event, sessionId)) {
						continue;
					}

					const data = `data: ${JSON.stringify(event)}\n\n`;
					controller.enqueue(encoder.encode(data));
				}
			} catch (error) {
				if (!abortController.signal.aborted) {
					console.error(`[SSE] Fatal error for session ${sessionId}:`, error);
					const errorEvent = `data: ${JSON.stringify({ type: "error", error: String(error) })}\n\n`;
					controller.enqueue(encoder.encode(errorEvent));
				}
			} finally {
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
