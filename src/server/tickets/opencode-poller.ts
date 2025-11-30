import { getOpencodeClient } from "@/lib/opencode-client";
import { isRedisAvailable } from "@/server/redis";
import type {
	MessagePart,
	OpencodeChatMessage,
	OpencodeMessage,
	ToolPart,
} from "./opencode";
import {
	completeSession,
	getSessionState,
	updateSessionState,
} from "./session-state";

function extractTextFromParts(parts: MessagePart[]): string {
	console.log(`[POLLER] extractTextFromParts(${JSON.stringify(parts)})`);
	const textParts = parts
		.filter(
			(part): part is Extract<MessagePart, { type: "text" }> =>
				part.type === "text",
		)
		.map((part) => part.text);

	const stepFinishParts = parts
		.filter(
			(part): part is Extract<MessagePart, { type: "step-finish" }> =>
				part.type === "step-finish",
		)
		.map((part) => part.reason);

	return [...textParts, ...stepFinishParts].join("\n");
}

function extractReasoningFromParts(parts: MessagePart[]): string {
	return parts
		.filter(
			(part): part is Extract<MessagePart, { type: "reasoning" }> =>
				part.type === "reasoning",
		)
		.map((part) => part.text)
		.join("\n")
		.trim();
}

function getModelLabel(message: OpencodeMessage["info"]): string | undefined {
	if ("model" in message && message.model) {
		return `${message.model.providerID}/${message.model.modelID}`;
	}

	if ("providerID" in message && "modelID" in message) {
		return `${message.providerID}/${message.modelID}`;
	}

	return undefined;
}

function getCreatedAt(message: OpencodeMessage["info"]): Date {
	const time =
		(message as { time?: { created?: number; completed?: number } }).time ?? {};
	const timestamp = time.created ?? time.completed ?? Date.now();
	return new Date(timestamp);
}

function mapToOpencodeChatMessage(
	msg: OpencodeMessage | null | undefined,
): OpencodeChatMessage | null {
	if (!msg || !msg.info) {
		return null;
	}

	// Debug logging for empty text
	if (msg.parts && msg.parts.length > 0) {
		const textParts = msg.parts.filter((p) => p.type === "text");
		if (textParts.length === 0 && msg.parts.some((p) => p.type !== "tool" && p.type !== "reasoning")) {
			console.log(`[POLLER] Message ${msg.info.id} has parts but no text/tool/reasoning:`, JSON.stringify(msg.parts));
		}
        // Log all parts for assistant messages to be sure
        if (msg.info.role === 'assistant') {
             console.log(`[POLLER] Assistant message ${msg.info.id} parts:`, JSON.stringify(msg.parts));
        }
	}

	const parts = msg.parts ?? [];
	const reasoning = extractReasoningFromParts(parts);
	return {
		id: msg.info.id,
		role: msg.info.role,
		text: extractTextFromParts(parts),
		createdAt: getCreatedAt(msg.info),
		model: getModelLabel(msg.info),
		toolCalls: parts
			.filter((part): part is ToolPart => part.type === "tool")
			.map((part) => ({ toolName: part.tool, toolCallId: part.callID })),
		parts: parts.length > 0 ? parts : undefined,
		reasoning: reasoning || undefined,
		sessionId: msg.info.sessionID,
	};
}

function extractCurrentToolCalls(messages: OpencodeMessage[]): ToolPart[] {
	const toolCalls: ToolPart[] = [];
	for (const msg of messages) {
		for (const part of msg.parts ?? []) {
			if (part.type === "tool") {
				const toolPart = part as ToolPart;
				if (
					toolPart.state.status === "pending" ||
					toolPart.state.status === "running"
				) {
					toolCalls.push(toolPart);
				}
			}
		}
	}
	return toolCalls;
}

async function checkSessionIdle(sessionId: string): Promise<boolean> {
	try {
		const client = getOpencodeClient();
		const result = await client.session.status();

		if (!result.data) {
			console.log(`[POLLER] checkSessionIdle(${sessionId}): no status data`);
			return false;
		}

		// Log all session statuses to debug
		const allStatuses = Object.entries(result.data);
		console.log(
			`[POLLER] checkSessionIdle(${sessionId}): all statuses = ${JSON.stringify(allStatuses)}`,
		);

		const status = result.data[sessionId];

		// If session is not in the status map, it might mean it's idle (not actively tracked)
		// Sessions that are idle might not appear in the status response
		if (!status) {
			console.log(
				`[POLLER] checkSessionIdle(${sessionId}): session not in status map, treating as idle`,
			);
			return true;
		}

		const isIdle = status.type === "idle";

		console.log(
			`[POLLER] checkSessionIdle(${sessionId}): status=${status.type}, isIdle=${isIdle}`,
		);

		return isIdle;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error(`[POLLER] checkSessionIdle(${sessionId}) error:`, message);
		return false;
	}
}

function hasAssistantMessage(messages: OpencodeMessage[]): boolean {
	return messages.some((msg) => msg.info.role === "assistant");
}

function hasPendingOrRunningTools(messages: OpencodeMessage[]): boolean {
	return messages.some((msg) =>
		(msg.parts ?? []).some(
			(part) =>
				part.type === "tool" &&
				((part as ToolPart).state.status === "pending" ||
					(part as ToolPart).state.status === "running"),
		),
	);
}

function getSessionContentHash(messages: OpencodeMessage[]): string {
	return messages
		.map((msg) => {
			const text = extractTextFromParts(msg.parts ?? []);
			const toolStates = (msg.parts ?? [])
				.filter((p): p is ToolPart => p.type === "tool")
				.map((p) => `${p.callID}:${p.state.status}`)
				.join(",");
			return `${msg.info.id}:${text}:${toolStates}`;
		})
		.join("|");
}

const activePollers = new Map<string, NodeJS.Timeout>();

interface PollerState {
	lastMessageCount: number;
	lastContentHash: string;
	consecutiveErrors: number;
}

const pollerStates = new Map<string, PollerState>();

export function startPolling(sessionId: string): void {
	if (activePollers.has(sessionId)) {
		console.log(`[POLLER] Already polling session ${sessionId}`);
		return;
	}

	if (!isRedisAvailable()) {
		console.warn(
			`[POLLER] Starting poller for session ${sessionId} without Redis - SSE updates will not work`,
		);
	} else {
		console.log(`[POLLER] Starting poller for session ${sessionId}`);
	}

	const maxConsecutiveErrors = 5;

	pollerStates.set(sessionId, {
		lastMessageCount: 0,
		lastContentHash: "",
		consecutiveErrors: 0,
	});

	const poll = async () => {
		const pollerState = pollerStates.get(sessionId);
		if (!pollerState) {
			console.warn(
				`[POLLER] No state found for session ${sessionId}, stopping`,
			);
			stopPolling(sessionId);
			return;
		}

		try {
			const client = getOpencodeClient();
			console.log(
				`[POLLER] Polling session ${sessionId} (lastMsgCount=${pollerState.lastMessageCount})`,
			);
			const result = await client.session.messages({
				path: { id: sessionId },
			});

			if (!result.data) {
				pollerState.consecutiveErrors++;
				const status = result.response?.status ?? 500;
				console.log(
					`[POLLER] No data for session ${sessionId}, status=${status}, errors=${pollerState.consecutiveErrors}`,
				);
				if (pollerState.consecutiveErrors >= maxConsecutiveErrors) {
					console.error(
						`[POLLER] Too many errors for session ${sessionId}, stopping poller`,
					);
					stopPolling(sessionId);
					await completeSession(sessionId, {
						error: `Failed to poll: ${status}`,
					});
				}
				return;
			}

			pollerState.consecutiveErrors = 0;

			const messages = result.data as OpencodeMessage[];
			const currentContentHash = getSessionContentHash(messages);

			const hasNewMessages = messages.length > pollerState.lastMessageCount;
			const hasContentChanges =
				currentContentHash !== pollerState.lastContentHash;

			console.log(
				`[POLLER] Session ${sessionId}: msgCount=${messages.length}, ` +
					`lastCount=${pollerState.lastMessageCount}, hasNew=${hasNewMessages}, ` +
					`contentChanged=${hasContentChanges}`,
			);

			// Update state if there are new messages or content changes (e.g. streaming updates)
			if (hasNewMessages || hasContentChanges) {
				const currentToolCalls = extractCurrentToolCalls(messages);
				const mappedMessages = messages
					.map(mapToOpencodeChatMessage)
					.filter((msg): msg is OpencodeChatMessage => msg !== null);

				await updateSessionState(sessionId, {
					messages: mappedMessages,
					replaceAllMessages: true,
					currentToolCalls,
					status: currentToolCalls.length > 0 ? "running" : "running",
				});

				pollerState.lastMessageCount = messages.length;
				pollerState.lastContentHash = currentContentHash;
			}

			// Always check if session is idle (completed) using Opencode's status API
			// This needs to run even when there are no new messages/tool changes
			// because the session may have just finished processing
			if (
				hasAssistantMessage(messages) &&
				!hasPendingOrRunningTools(messages)
			) {
				const isIdle = await checkSessionIdle(sessionId);
				if (isIdle) {
					try {
						// Only auto-complete sessions that are tracked as "ask" inquiries
						// in our Redis state. Chat/admin sessions remain long-lived.
						const redisState = await getSessionState(sessionId);

						if (!redisState) {
							console.warn(
								`[POLLER] Session ${sessionId} appears complete but has no Redis state; stopping poller without archiving`,
							);
							stopPolling(sessionId);
							return;
						}

						if (redisState.sessionType !== "ask") {
							console.log(
								`[POLLER] Session ${sessionId} (${redisState.sessionType}) reached completion criteria; not auto-completing`,
							);
							stopPolling(sessionId);
							return;
						}

						console.log(`[POLLER] Session ${sessionId} completed (idle)`);
						stopPolling(sessionId);
						await completeSession(sessionId);
					} catch (error) {
						const message =
							error instanceof Error ? error.message : "Unknown error";
						console.error(
							`[POLLER] Failed to complete session ${sessionId}:`,
							message,
						);
					}
				}
			}
		} catch (error) {
			const currentPollerState = pollerStates.get(sessionId);
			if (currentPollerState) {
				currentPollerState.consecutiveErrors++;
				const message =
					error instanceof Error ? error.message : "Unknown error";
				console.error(`[POLLER] Error polling session ${sessionId}:`, message);

				if (currentPollerState.consecutiveErrors >= maxConsecutiveErrors) {
					console.error(
						`[POLLER] Too many errors for session ${sessionId}, stopping poller`,
					);
					stopPolling(sessionId);
					await completeSession(sessionId, { error: message });
				}
			}
		}
	};

	poll();
	const intervalId = setInterval(poll, 500);

	activePollers.set(sessionId, intervalId);
}

export function stopPolling(sessionId: string): void {
	const intervalId = activePollers.get(sessionId);
	if (intervalId) {
		clearInterval(intervalId);
		activePollers.delete(sessionId);
		pollerStates.delete(sessionId);
		console.log(`[POLLER] Stopped polling session ${sessionId}`);
	}
}

export function isPolling(sessionId: string): boolean {
	return activePollers.has(sessionId);
}
