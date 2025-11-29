import { getOpencodeClient } from "@/lib/opencode-client";
import { isRedisAvailable } from "@/server/redis";
import type {
	MessagePart,
	OpencodeChatMessage,
	OpencodeMessage,
	ToolPart,
} from "./opencode";
import { completeSession, updateSessionState } from "./session-state";

function extractTextFromParts(parts: MessagePart[]): string {
	return parts
		.filter(
			(part): part is Extract<MessagePart, { type: "text" }> =>
				part.type === "text",
		)
		.map((part) => part.text)
		.join("\n");
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

function isSessionComplete(messages: OpencodeMessage[]): boolean {
	if (messages.length === 0) {
		return false;
	}

	const lastMessage = messages[messages.length - 1];
	if (!lastMessage || lastMessage.info.role !== "assistant") {
		return false;
	}

	const hasPendingTools = lastMessage.parts?.some(
		(part) =>
			part.type === "tool" &&
			((part as ToolPart).state.status === "pending" ||
				(part as ToolPart).state.status === "running"),
	);

	const hasText = lastMessage.parts?.some(
		(part) =>
			part.type === "text" && (part as { text: string }).text.trim().length > 0,
	);

	return !hasPendingTools && Boolean(hasText);
}

function getToolStateHash(messages: OpencodeMessage[]): string {
	const toolStates: string[] = [];
	for (const msg of messages) {
		for (const part of msg.parts ?? []) {
			if (part.type === "tool") {
				const toolPart = part as ToolPart;
				toolStates.push(`${toolPart.callID}:${toolPart.state.status}`);
			}
		}
	}
	return toolStates.join("|");
}

const activePollers = new Map<string, NodeJS.Timeout>();

interface PollerState {
	lastMessageCount: number;
	lastToolStateHash: string;
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
		lastToolStateHash: "",
		consecutiveErrors: 0,
	});

	const poll = async () => {
		const state = pollerStates.get(sessionId);
		if (!state) {
			console.warn(
				`[POLLER] No state found for session ${sessionId}, stopping`,
			);
			stopPolling(sessionId);
			return;
		}

		try {
			const client = getOpencodeClient();
			const result = await client.session.messages({
				path: { id: sessionId },
			});

			if (!result.data) {
				state.consecutiveErrors++;
				const status = result.response?.status ?? 500;
				if (state.consecutiveErrors >= maxConsecutiveErrors) {
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

			state.consecutiveErrors = 0;

			const messages = result.data as OpencodeMessage[];
			const currentToolStateHash = getToolStateHash(messages);

			const hasNewMessages = messages.length > state.lastMessageCount;
			const hasToolStateChanges =
				currentToolStateHash !== state.lastToolStateHash;

			if (hasNewMessages || hasToolStateChanges) {
				const currentToolCalls = extractCurrentToolCalls(messages);

				if (hasNewMessages) {
					const newMessages = messages.slice(state.lastMessageCount);
					const mappedMessages = newMessages
						.map(mapToOpencodeChatMessage)
						.filter((msg): msg is OpencodeChatMessage => msg !== null);

					await updateSessionState(sessionId, {
						messages: mappedMessages,
						currentToolCalls,
						status: currentToolCalls.length > 0 ? "running" : "running",
					});

					state.lastMessageCount = messages.length;
				} else if (hasToolStateChanges) {
					await updateSessionState(sessionId, {
						currentToolCalls,
						status: currentToolCalls.length > 0 ? "running" : "running",
					});
				}

				state.lastToolStateHash = currentToolStateHash;

				if (isSessionComplete(messages)) {
					console.log(`[POLLER] Session ${sessionId} completed`);
					stopPolling(sessionId);
					await completeSession(sessionId);
				}
			}
		} catch (error) {
			const currentState = pollerStates.get(sessionId);
			if (currentState) {
				currentState.consecutiveErrors++;
				const message =
					error instanceof Error ? error.message : "Unknown error";
				console.error(`[POLLER] Error polling session ${sessionId}:`, message);

				if (currentState.consecutiveErrors >= maxConsecutiveErrors) {
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
