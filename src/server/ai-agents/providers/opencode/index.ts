/**
 * OpenCode Agent Provider
 *
 * Implementation of AgentProvider for the OpenCode SDK.
 */

import type { Session, ToolPart } from "@opencode-ai/sdk";
import type {
	AgentCapabilities,
	AgentMessage,
	AgentProvider,
	AgentSession,
	SendMessageOptions,
	SessionDiffItem,
	SessionStatusInfo,
	SessionTodoItem,
} from "@/types/ai-agent";
import { getDefaultModel } from "../../model-selector";
import { getOpencodeClient } from "./client";
import { getCurrentToolCalls, transformMessage } from "./message-utils";

/**
 * OpenCode agent provider implementation
 *
 * Provides AI agent capabilities via the OpenCode SDK.
 *
 * @example
 * ```typescript
 * const provider = new OpencodeProvider();
 *
 * if (await provider.checkHealth()) {
 *   const session = await provider.createSession("My Chat");
 *   const response = await provider.sendMessage(session.id, "Hello!");
 *   console.log(response.content);
 * }
 * ```
 */
export class OpencodeProvider implements AgentProvider {
	readonly name = "opencode";

	/**
	 * Check if the provider is properly configured
	 */
	isConfigured(): boolean {
		try {
			getOpencodeClient();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Verify connectivity to the OpenCode server
	 */
	async checkHealth(): Promise<boolean> {
		try {
			const client = getOpencodeClient();
			const result = await client.app.agents();
			return Boolean(result.data);
		} catch {
			return false;
		}
	}

	/**
	 * Get capabilities supported by this provider
	 */
	getCapabilities(): AgentCapabilities {
		return {
			sessionStatus: true,
			toolCalls: true,
			sessionDiff: true,
			sessionTodos: true,
			asyncPrompts: true,
			subagents: true,
		};
	}

	/**
	 * Create a new chat session
	 *
	 * @param title - Optional title for the session
	 */
	async createSession(title?: string): Promise<AgentSession> {
		const client = getOpencodeClient();
		const result = await client.session.create({
			body: { title },
		});

		if (!result.data) {
			throw new Error(
				`Failed to create session: ${JSON.stringify(result.error)}`,
			);
		}

		const session = result.data as Session;

		return {
			id: session.id,
			title: session.title,
			status: "idle",
			createdAt: new Date(),
		};
	}

	/**
	 * Get an existing session by ID
	 *
	 * @param sessionId - The session ID
	 */
	async getSession(sessionId: string): Promise<AgentSession | null> {
		try {
			const client = getOpencodeClient();
			const result = await client.session.messages({
				path: { id: sessionId },
				query: { limit: 1 },
			});

			if (result.response?.status === 404 || result.response?.status === 410) {
				return null;
			}

			if (!result.response?.ok) {
				return null;
			}

			return {
				id: sessionId,
				status: "idle",
				createdAt: new Date(),
			};
		} catch {
			return null;
		}
	}

	/**
	 * List all available sessions
	 */
	async listSessions(): Promise<AgentSession[]> {
		const client = getOpencodeClient();
		const result = await client.session.list();

		if (!result.data) {
			return [];
		}

		return result.data.map((session: Session) => ({
			id: session.id,
			title: session.title,
			status: "idle" as const,
			createdAt: new Date(),
		}));
	}

	/**
	 * Send a message and get a response
	 *
	 * @param sessionId - Session to send to
	 * @param message - Message content
	 * @param options - Send options including model selection
	 */
	async sendMessage(
		sessionId: string,
		message: string,
		options?: SendMessageOptions,
	): Promise<AgentMessage> {
		const client = getOpencodeClient();
		const model = options?.model ?? getDefaultModel();

		const result = await client.session.prompt({
			path: { id: sessionId },
			body: {
				agent: "docs-agent",
				parts: [{ type: "text" as const, text: message }],
				model: {
					providerID: model.providerId,
					modelID: model.modelId,
				},
			},
		});

		if (!result.data) {
			throw new Error(
				`Failed to send message: ${JSON.stringify(result.error)}`,
			);
		}

		const parts = result.data.parts;
		const transformed = transformMessage(result.data.info, parts);

		return {
			id: transformed.id,
			role: transformed.role,
			content: transformed.text,
			createdAt: transformed.createdAt,
			parts, // Include raw parts for UI tool call rendering
			metadata: {
				model: transformed.model,
				toolCalls: transformed.toolCalls,
				reasoning: transformed.reasoning,
			},
		};
	}

	/**
	 * Get all messages in a session
	 *
	 * @param sessionId - The session ID
	 */
	async getMessages(sessionId: string): Promise<AgentMessage[]> {
		const client = getOpencodeClient();
		const result = await client.session.messages({
			path: { id: sessionId },
		});

		if (!result.data) {
			throw new Error(
				`Failed to get messages: ${result.response?.status ?? "unknown"}`,
			);
		}

		const messages: AgentMessage[] = [];

		for (const msg of result.data) {
			if (!msg?.info) continue;

			const parts = msg.parts ?? [];
			const transformed = transformMessage(msg.info, parts);
			messages.push({
				id: transformed.id,
				role: transformed.role,
				content: transformed.text,
				createdAt: transformed.createdAt,
				parts, // Include raw parts for UI tool call rendering
				metadata: {
					model: transformed.model,
					toolCalls: transformed.toolCalls,
					reasoning: transformed.reasoning,
				},
			});
		}

		return messages;
	}

	/**
	 * Check if this provider supports SSE streaming
	 */
	supportsStreaming(): boolean {
		return true;
	}

	/**
	 * Get SSE endpoint URL for real-time updates
	 *
	 * @param sessionId - The session ID
	 */
	getEventSourceUrl(sessionId: string): string {
		return `/api/opencode/events?sessionId=${sessionId}`;
	}

	// ========================================================================
	// Extended Capabilities
	// ========================================================================

	/**
	 * Get session status
	 *
	 * @param sessionId - The session ID
	 */
	async getSessionStatus(sessionId: string): Promise<SessionStatusInfo> {
		const client = getOpencodeClient();
		const result = await client.session.status();
		const status = result.data?.[sessionId];
		return status ?? { type: "idle" };
	}

	/**
	 * Get all session statuses
	 */
	async getAllSessionStatuses(): Promise<Record<string, SessionStatusInfo>> {
		const client = getOpencodeClient();
		const result = await client.session.status();
		return (result.data as Record<string, SessionStatusInfo>) ?? {};
	}

	/**
	 * Get tool calls for a session
	 *
	 * @param sessionId - The session ID
	 */
	async getToolCalls(sessionId: string): Promise<ToolPart[]> {
		const client = getOpencodeClient();
		const messagesResult = await client.session.messages({
			path: { id: sessionId },
		});
		const allParts = (messagesResult.data ?? []).flatMap((m) => m.parts);
		return getCurrentToolCalls(allParts);
	}

	/**
	 * Get session diff (code changes)
	 *
	 * @param sessionId - The session ID
	 */
	async getSessionDiff(sessionId: string): Promise<SessionDiffItem[]> {
		const client = getOpencodeClient();
		const result = await client.session.diff({ path: { id: sessionId } });
		// SDK returns FileDiff[] with { file, before, after, additions, deletions }
		const fileDiffs = result.data ?? [];
		return fileDiffs.map((diff) => ({
			path: diff.file,
			status: (diff.additions > 0 && diff.deletions === 0
				? "added"
				: diff.deletions > 0 && diff.additions === 0
					? "deleted"
					: "modified") as "added" | "modified" | "deleted",
			diff: `${diff.before}\n---\n${diff.after}`,
		}));
	}

	/**
	 * Get session todos
	 *
	 * @param sessionId - The session ID
	 */
	async getSessionTodos(sessionId: string): Promise<SessionTodoItem[]> {
		const client = getOpencodeClient();
		const result = await client.session.todo({ path: { id: sessionId } });
		// SDK returns Todo[] with { id, content, status, priority }
		const todos = result.data ?? [];
		return todos.map((todo) => ({
			id: todo.id,
			content: todo.content,
			status: (todo.status === "in_progress"
				? "in_progress"
				: todo.status === "completed"
					? "completed"
					: "pending") as "pending" | "in_progress" | "completed",
		}));
	}

	/**
	 * Send async prompt without waiting for response
	 *
	 * @param sessionId - Session to send to
	 * @param message - Message content
	 * @param options - Send options
	 */
	async sendMessageAsync(
		sessionId: string,
		message: string,
		options?: SendMessageOptions,
	): Promise<void> {
		const client = getOpencodeClient();
		const model = options?.model ?? getDefaultModel();

		await client.session.promptAsync({
			path: { id: sessionId },
			body: {
				agent: "docs-agent",
				parts: [{ type: "text" as const, text: message }],
				model: {
					providerID: model.providerId,
					modelID: model.modelId,
				},
			},
		});
	}
}
