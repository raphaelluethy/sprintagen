import { fetchFromOpencode } from "@/lib/opencode";
import { isRedisAvailable } from "@/server/redis";
import type {
	MessagePart,
	OpencodeChatMessage,
	OpencodeMessage,
	ToolPart,
} from "./opencode";
import { completeSession, updateSessionState } from "./session-state";

/**
 * Map Opencode message to chat DTO (reused from opencode.ts logic)
 */
function extractTextFromParts(parts: MessagePart[]): string {
	return parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("\n");
}

function mapToOpencodeChatMessage(
	msg: OpencodeMessage | null | undefined,
): OpencodeChatMessage | null {
	if (!msg || !msg.info) {
		return null;
	}

	const parts = msg.parts ?? [];
	return {
		id: msg.info.id,
		role: msg.info.role,
		text: extractTextFromParts(parts),
		createdAt: new Date(msg.info.createdAt),
		model: msg.info.model
			? `${msg.info.model.providerID}/${msg.info.model.modelID}`
			: undefined,
		toolCalls: parts
			.filter((p): p is ToolPart => p.type === "tool")
			.map((p) => ({ toolName: p.tool, toolCallId: p.callID })),
		parts: parts.length > 0 ? parts : undefined,
		reasoning:
			parts
				.filter((p) => p.type === "reasoning")
				.map((p) => (p as { text: string }).text)
				.join("\n")
				.trim() || undefined,
		sessionId: msg.info.sessionID,
	};
}

/**
 * Extract current tool calls from messages (pending or running)
 */
function extractCurrentToolCalls(messages: OpencodeMessage[]): ToolPart[] {
	const toolCalls: ToolPart[] = [];
	for (const msg of messages) {
		for (const part of msg.parts ?? []) {
			if (part.type === "tool") {
				const toolPart = part as ToolPart;
				// Only include pending or running tools
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

/**
 * Check if session is complete (has assistant message without pending tools)
 */
function isSessionComplete(messages: OpencodeMessage[]): boolean {
	if (messages.length === 0) {
		return false;
	}

	const lastMessage = messages[messages.length - 1];
	if (!lastMessage) {
		return false;
	}

	// If the last message is from the user, session is not complete
	if (lastMessage.info.role !== "assistant") {
		return false;
	}

	// Check if there are any pending or running tools in the last message
	const hasPendingTools = lastMessage.parts?.some(
		(p) =>
			p.type === "tool" &&
			((p as ToolPart).state.status === "pending" ||
				(p as ToolPart).state.status === "running"),
	);

	// Session is complete if no pending tools and we have text content
	const hasText = lastMessage.parts?.some(
		(p) => p.type === "text" && (p as { text: string }).text.trim().length > 0,
	);

	return !hasPendingTools && hasText;
}

/**
 * Generate a hash of tool states for comparison
 */
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

/**
 * Active pollers map: sessionId -> intervalId
 */
const activePollers = new Map<string, NodeJS.Timeout>();

/**
 * Poller state (kept separate from map to avoid confusion)
 */
interface PollerState {
	lastMessageCount: number;
	lastToolStateHash: string;
	consecutiveErrors: number;
}

const pollerStates = new Map<string, PollerState>();

/**
 * Start polling a session
 * Note: Poller still works without Redis, but updates won't be pushed via SSE
 */
export function startPolling(sessionId: string): void {
	// Don't start if already polling
	if (activePollers.has(sessionId)) {
		console.log(`[POLLER] Already polling session ${sessionId}`);
		return;
	}

	// Log warning if Redis is not available
	if (!isRedisAvailable()) {
		console.warn(
			`[POLLER] Starting poller for session ${sessionId} without Redis - SSE updates will not work`,
		);
	} else {
		console.log(`[POLLER] Starting poller for session ${sessionId}`);
	}

	const maxConsecutiveErrors = 5;

	// Initialize poller state
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
			const response = await fetchFromOpencode(
				`/session/${sessionId}/message`,
				{
					method: "GET",
					headers: { "Content-Type": "application/json" },
				},
			);

			if (!response.ok) {
				state.consecutiveErrors++;
				if (state.consecutiveErrors >= maxConsecutiveErrors) {
					console.error(
						`[POLLER] Too many errors for session ${sessionId}, stopping poller`,
					);
					stopPolling(sessionId);
					await completeSession(sessionId, {
						error: `Failed to poll: ${response.status}`,
					});
				}
				return;
			}

			state.consecutiveErrors = 0; // Reset on success

			const responseData = await response.json();

			// Check for error response
			if (
				responseData.error ||
				(responseData.data?.message && !Array.isArray(responseData))
			) {
				const errorMessage =
					responseData.data?.message ||
					responseData.message ||
					responseData.error ||
					"Opencode returned an error";
				console.error(`[POLLER] Error for session ${sessionId}:`, errorMessage);
				stopPolling(sessionId);
				await completeSession(sessionId, { error: errorMessage });
				return;
			}

			const messagesArray = responseData.data || responseData;
			if (!Array.isArray(messagesArray)) {
				console.warn(
					`[POLLER] Invalid response format for session ${sessionId}`,
				);
				return;
			}

			const messages = messagesArray as OpencodeMessage[];
			const currentToolStateHash = getToolStateHash(messages);

			// Check if we have new messages OR tool state changes
			const hasNewMessages = messages.length > state.lastMessageCount;
			const hasToolStateChanges =
				currentToolStateHash !== state.lastToolStateHash;

			if (hasNewMessages || hasToolStateChanges) {
				// Extract current tool calls (pending/running)
				const currentToolCalls = extractCurrentToolCalls(messages);

				if (hasNewMessages) {
					// Map only new messages
					const newMessages = messages.slice(state.lastMessageCount);
					const mappedMessages = newMessages
						.map(mapToOpencodeChatMessage)
						.filter((msg): msg is OpencodeChatMessage => msg !== null);

					// Update Redis state with new messages
					await updateSessionState(sessionId, {
						messages: mappedMessages,
						currentToolCalls,
						status: currentToolCalls.length > 0 ? "running" : "running",
					});

					state.lastMessageCount = messages.length;
				} else if (hasToolStateChanges) {
					// Only tool states changed, no new messages
					await updateSessionState(sessionId, {
						currentToolCalls,
						status: currentToolCalls.length > 0 ? "running" : "running",
					});
				}

				state.lastToolStateHash = currentToolStateHash;

				// Check if session is complete
				if (isSessionComplete(messages)) {
					console.log(`[POLLER] Session ${sessionId} completed`);
					stopPolling(sessionId);
					await completeSession(sessionId);
				}
			}
		} catch (error) {
			const state = pollerStates.get(sessionId);
			if (state) {
				state.consecutiveErrors++;
				const message =
					error instanceof Error ? error.message : "Unknown error";
				console.error(`[POLLER] Error polling session ${sessionId}:`, message);

				if (state.consecutiveErrors >= maxConsecutiveErrors) {
					console.error(
						`[POLLER] Too many errors for session ${sessionId}, stopping poller`,
					);
					stopPolling(sessionId);
					await completeSession(sessionId, { error: message });
				}
			}
		}
	};

	// Start polling immediately, then every 500ms
	poll();
	const intervalId = setInterval(poll, 500);

	activePollers.set(sessionId, intervalId);
}

/**
 * Stop polling a session
 */
export function stopPolling(sessionId: string): void {
	const intervalId = activePollers.get(sessionId);
	if (intervalId) {
		clearInterval(intervalId);
		activePollers.delete(sessionId);
		pollerStates.delete(sessionId);
		console.log(`[POLLER] Stopped polling session ${sessionId}`);
	}
}

/**
 * Check if a session is being polled
 */
export function isPolling(sessionId: string): boolean {
	return activePollers.has(sessionId);
}
