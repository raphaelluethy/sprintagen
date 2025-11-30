import type { Message, Part, SessionStatus, ToolPart } from "@opencode-ai/sdk";
import { useMemo } from "react";
import { api } from "@/trpc/react";

/**
 * Message with parts combined
 */
interface MessageWithParts {
	info: Message;
	parts: Part[];
}

interface UseOpencodeStreamResult {
	messages: MessageWithParts[];
	toolCalls: ToolPart[];
	/** Legacy status string for backward compatibility */
	status: "pending" | "running" | "completed" | "error";
	/** SDK SessionStatus object */
	sessionStatus: SessionStatus;
	error: string | null;
	isConnected: boolean;
}

/**
 * Hook to poll for OpenCode session updates
 * Replaces the previous SSE implementation with TRPC polling
 */
export function useOpencodeStream(
	sessionId: string | null,
): UseOpencodeStreamResult {
	const query = api.opencode.getFullSession.useQuery(
		{ sessionId: sessionId ?? "" },
		{
			enabled: !!sessionId,
			refetchInterval: (query) => {
				const data = query.state.data;
				// Stop polling if session is idle (completed) or error
				if (!data) return 1000;
				if (data.status.type === "idle") return false;
				return 1000; // Poll every 1s while running
			},
			retry: false,
		},
	);

	const messages = useMemo(() => {
		if (!query.data?.messages) return [];
		// Map flattened messages back to MessageWithParts structure if needed
		// The router returns transformed messages which are flattened
		// We'll reconstruct the info/parts structure to maintain compatibility
		return query.data.messages.map((msg) => ({
			info: {
				id: msg.id,
				role: msg.role,
				sessionID: msg.sessionId ?? "",
				time: { created: msg.createdAt.getTime() },
				// We don't have all original info fields but this should suffice for UI
			} as Message,
			parts: msg.parts ?? [],
		}));
	}, [query.data?.messages]);

	const toolCalls = useMemo(() => {
		return query.data?.toolCalls ?? [];
	}, [query.data?.toolCalls]);

	const sessionStatus = useMemo((): SessionStatus => {
		return query.data?.status ?? { type: "idle" };
	}, [query.data?.status]);

	const status = useMemo((): "pending" | "running" | "completed" | "error" => {
		if (query.isError) return "error";
		if (query.isLoading && !query.data) return "pending";

		switch (sessionStatus.type) {
			case "busy":
				return "running";
			case "retry":
				return "running";
			case "idle":
				// If we have messages and status is idle, it's completed
				return messages.length > 0 ? "completed" : "pending";
			default:
				return "pending";
		}
	}, [
		query.isError,
		query.isLoading,
		query.data,
		sessionStatus,
		messages.length,
	]);

	return {
		messages,
		toolCalls,
		status,
		sessionStatus,
		error: query.error?.message ?? null,
		isConnected: !query.isError && !!sessionId,
	};
}

/**
 * Hook to get transformed messages for display
 * Converts SDK format to the legacy OpencodeChatMessage format for backward compatibility
 * @deprecated Use useOpencodeStream directly or the TRPC query
 */
export function useOpencodeMessages(sessionId: string | null) {
	const { messages, toolCalls, status, sessionStatus, error, isConnected } =
		useOpencodeStream(sessionId);

	// Transform to legacy format - memoized to prevent unnecessary re-renders
	const transformedMessages = useMemo(
		() =>
			messages.map((m) => {
				const textParts = m.parts
					.filter(
						(p): p is Extract<Part, { type: "text" }> => p.type === "text",
					)
					.map((p) => p.text);

				const stepFinishParts = m.parts
					.filter(
						(p): p is Extract<Part, { type: "step-finish" }> =>
							p.type === "step-finish",
					)
					.map((p) => p.reason);

				const fileParts = m.parts
					.filter(
						(p): p is Extract<Part, { type: "file" }> => p.type === "file",
					)
					.map((p) => {
						// @ts-expect-error - SDK types might be incomplete in our view
						const content = p.content ?? p.data ?? "";
						// @ts-expect-error - SDK types might be incomplete in our view
						const mimeType = p.mimeType ?? "application/octet-stream";
						return `[File: ${mimeType}]\n${content}`;
					});

				const reasoningParts = m.parts
					.filter(
						(p): p is Extract<Part, { type: "reasoning" }> =>
							p.type === "reasoning",
					)
					.map((p) => p.text);

				const time = m.info.time as { created?: number; completed?: number };

				return {
					id: m.info.id,
					role: m.info.role,
					text: [...textParts, ...fileParts, ...stepFinishParts].join("\n"),
					createdAt: new Date(time.created ?? Date.now()),
					model:
						"providerID" in m.info && "modelID" in m.info
							? `${m.info.providerID}/${m.info.modelID}`
							: undefined,
					toolCalls: m.parts
						.filter((p): p is ToolPart => p.type === "tool")
						.map((p) => ({ toolName: p.tool, toolCallId: p.callID })),
					parts: m.parts,
					reasoning: reasoningParts.join("\n").trim() || undefined,
					sessionId: m.info.sessionID,
				};
			}),
		[messages],
	);

	return {
		messages: transformedMessages,
		toolCalls,
		status,
		sessionStatus,
		error,
		isConnected,
	};
}
