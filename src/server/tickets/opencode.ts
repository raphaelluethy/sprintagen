import { eq } from "drizzle-orm";
import { env } from "@/env";
import { fetchFromOpencode } from "@/lib/opencode";
import { db } from "@/server/db";
import { tickets } from "@/server/db/schema";

/**
 * Opencode message part types - matching admin/chats structure
 */
interface TextPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "text";
	text: string;
	synthetic?: boolean;
	ignored?: boolean;
	time?: {
		start: number;
		end?: number;
	};
	metadata?: Record<string, unknown>;
}

interface ReasoningPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "reasoning";
	text: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
		end?: number;
	};
}

interface ToolStatePending {
	status: "pending";
	input: Record<string, unknown>;
	raw: string;
}

interface ToolStateRunning {
	status: "running";
	input: Record<string, unknown>;
	title?: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
	};
}

interface ToolStateCompleted {
	status: "completed";
	input: Record<string, unknown>;
	output: string;
	title: string;
	metadata: Record<string, unknown>;
	time: {
		start: number;
		end: number;
		compacted?: number;
	};
}

interface ToolStateError {
	status: "error";
	input: Record<string, unknown>;
	error: string;
	metadata?: Record<string, unknown>;
	time: {
		start: number;
		end: number;
	};
}

export type ToolState =
	| ToolStatePending
	| ToolStateRunning
	| ToolStateCompleted
	| ToolStateError;

interface ToolPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "tool";
	callID: string;
	tool: string;
	state: ToolState;
	metadata?: Record<string, unknown>;
}

interface StepStartPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "step-start";
	snapshot?: string;
}

interface StepFinishPart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "step-finish";
	reason: string;
	snapshot?: string;
	cost: number;
	tokens: {
		input: number;
		output: number;
		reasoning: number;
		cache: {
			read: number;
			write: number;
		};
	};
}

interface FilePart {
	id: string;
	sessionID: string;
	messageID: string;
	type: "file";
	mime: string;
	filename?: string;
	url: string;
}

export type MessagePart =
	| TextPart
	| ReasoningPart
	| ToolPart
	| StepStartPart
	| StepFinishPart
	| FilePart;

// Export types for frontend use
export type { ToolPart, ReasoningPart };

/**
 * Opencode message structure
 */
interface OpencodeMessage {
	info: {
		id: string;
		sessionID: string;
		role: "user" | "assistant";
		createdAt: number;
		model?: {
			providerID: string;
			modelID: string;
		};
	};
	parts: MessagePart[];
}

/**
 * Opencode session structure
 */
interface OpencodeSession {
	id: string;
	title?: string;
	parentID?: string;
	createdAt: number;
}

/**
 * Chat message DTO for the frontend
 */
export interface OpencodeChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
	createdAt: Date;
	model?: string;
	toolCalls?: {
		toolName: string;
		toolCallId: string;
	}[];
	// Full parts array for rendering steps/tools/reasoning
	parts?: MessagePart[];
	// Reasoning text if available
	reasoning?: string;
}

/**
 * Result type for operations that can fail gracefully
 */
export type OpencodeResult<T> =
	| { success: true; data: T }
	| { success: false; error: string };

/**
 * Ticket metadata with optional opencode session ID
 */
interface TicketMetadata {
	opencodeSessionId?: string;
	[key: string]: unknown;
}

/**
 * Check if Opencode server is available
 */
export async function checkOpencodeHealth(): Promise<boolean> {
	try {
		const response = await fetchFromOpencode("/agent", {
			method: "GET",
			headers: { "Content-Type": "application/json" },
		});
		console.log("[OPENCODE] Health check response:", response);
		if (env.FAST_MODE) {
			console.log("[OPENCODE] Fast mode is enabled");
		}
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Get or create an Opencode session for a ticket
 */
export async function getOrCreateOpencodeSession(
	ticketId: string,
	ticketTitle: string,
): Promise<OpencodeResult<string>> {
	try {
		// Get ticket to check for existing session
		const ticket = await db.query.tickets.findFirst({
			where: eq(tickets.id, ticketId),
		});

		if (!ticket) {
			return { success: false, error: "Ticket not found" };
		}

		const metadata = (ticket.metadata ?? {}) as TicketMetadata;

		// If session already exists, return it
		if (metadata.opencodeSessionId) {
			return { success: true, data: metadata.opencodeSessionId };
		}

		// Create a new session
		const response = await fetchFromOpencode("/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: `Ticket: ${ticketTitle} (${ticketId})`,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			return {
				success: false,
				error: `Failed to create Opencode session: ${errorText}`,
			};
		}

		const session = (await response.json()) as OpencodeSession;

		// Persist the session ID to the ticket's metadata
		await db
			.update(tickets)
			.set({
				metadata: {
					...metadata,
					opencodeSessionId: session.id,
				},
			})
			.where(eq(tickets.id, ticketId));

		return { success: true, data: session.id };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return { success: false, error: message };
	}
}

/**
 * Extract text content from Opencode message parts
 */
function extractTextFromParts(parts: MessagePart[]): string {
	return parts
		.filter((p): p is TextPart => p.type === "text")
		.map((p) => p.text)
		.join("\n");
}

/**
 * Extract reasoning content from Opencode message parts
 */
function extractReasoningFromParts(parts: MessagePart[]): string {
	return parts
		.filter((p): p is ReasoningPart => p.type === "reasoning")
		.map((p) => p.text)
		.join("\n")
		.trim();
}

/**
 * Extract tool calls from Opencode message parts (for backward compatibility)
 */
function extractToolCalls(
	parts: MessagePart[],
): { toolName: string; toolCallId: string }[] {
	return parts
		.filter((p): p is ToolPart => p.type === "tool")
		.map((p) => ({ toolName: p.tool, toolCallId: p.callID }));
}

/**
 * Map Opencode message to chat DTO
 */
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
		createdAt: new Date(msg.info.createdAt),
		model: msg.info.model
			? `${msg.info.model.providerID}/${msg.info.model.modelID}`
			: undefined,
		toolCalls: extractToolCalls(parts),
		// Include full parts for step/tool rendering
		parts: parts.length > 0 ? parts : undefined,
		// Include reasoning if available
		reasoning: reasoning || undefined,
	};
}

/**
 * Get chat messages for a ticket's Opencode session
 */
export async function getOpencodeMessages(
	ticketId: string,
	ticketTitle: string,
): Promise<OpencodeResult<OpencodeChatMessage[]>> {
	// Ensure session exists
	const sessionResult = await getOrCreateOpencodeSession(ticketId, ticketTitle);
	if (!sessionResult.success) {
		return sessionResult;
	}

	const sessionId = sessionResult.data;

	try {
		const response = await fetchFromOpencode(`/session/${sessionId}/message`, {
			method: "GET",
			headers: { "Content-Type": "application/json" },
		});

		if (!response.ok) {
			return {
				success: false,
				error: `Failed to fetch messages: ${response.status}`,
			};
		}

		const responseData = await response.json();

		// Check if the response is an error object (Opencode may return errors with 200 status)
		if (
			responseData.error ||
			(responseData.data?.message && !Array.isArray(responseData))
		) {
			const errorMessage =
				responseData.data?.message ||
				responseData.message ||
				responseData.error ||
				"Opencode returned an error";
			return {
				success: false,
				error: errorMessage,
			};
		}

		// Handle case where response might be wrapped in a data property
		const messagesArray = responseData.data || responseData;
		if (!Array.isArray(messagesArray)) {
			return {
				success: false,
				error: "Invalid response format from Opencode",
			};
		}

		const messages = messagesArray as OpencodeMessage[];
		const mapped = messages
			.map(mapToOpencodeChatMessage)
			.filter((msg): msg is OpencodeChatMessage => msg !== null);

		return { success: true, data: mapped };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return { success: false, error: message };
	}
}

/**
 * Send a message to a ticket's Opencode session
 */
export async function sendOpencodeMessage(
	ticketId: string,
	ticketTitle: string,
	userMessage: string,
): Promise<OpencodeResult<OpencodeChatMessage>> {
	// Ensure session exists
	const sessionResult = await getOrCreateOpencodeSession(ticketId, ticketTitle);
	if (!sessionResult.success) {
		return sessionResult;
	}

	const sessionId = sessionResult.data;

	try {
		// Build the message payload
		const payload: {
			agent?: string;
			model?: { providerID: string; modelID: string };
			parts: { type: "text"; text: string }[];
		} = {
			agent: "docs-agent",
			parts: [{ type: "text", text: userMessage }],
		};

		// Use provided model if both providerID and modelID are set,
		// otherwise default to big-pickle for ticket flows
		if (env.FAST_MODE) {
			payload.model = {
				providerID: "cerebras",
				modelID: "zai-glm-4.6",
			};
		} else {
			// Default to big-pickle for ticket Opencode calls
			payload.model = {
				providerID: "opencode",
				modelID: "big-pickle",
			};
		}

		const response = await fetchFromOpencode(`/session/${sessionId}/message`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			return {
				success: false,
				error: `Failed to send message: ${errorText}`,
			};
		}

		const responseData = await response.json();

		// Check if the response is an error object (Opencode may return errors with 200 status)
		if (
			responseData.error ||
			(responseData.data?.message && !responseData.info)
		) {
			const errorMessage =
				responseData.data?.message ||
				responseData.message ||
				responseData.error ||
				"Opencode returned an error";
			return {
				success: false,
				error: errorMessage,
			};
		}

		// Handle case where response might be wrapped in a data property
		const messageData = responseData.data || responseData;
		if (!messageData || !messageData.info) {
			return {
				success: false,
				error: "Invalid response format from Opencode",
			};
		}

		const assistantMessage = messageData as OpencodeMessage;
		const mapped = mapToOpencodeChatMessage(assistantMessage);

		if (!mapped) {
			return {
				success: false,
				error: "Failed to map Opencode message response",
			};
		}

		return {
			success: true,
			data: mapped,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return { success: false, error: message };
	}
}

/**
 * Send a prompt to Opencode and extract plain text response
 */
export async function askOpencodeQuestion(
	ticketId: string,
	ticketTitle: string,
	prompt: string,
): Promise<OpencodeResult<string>> {
	const result = await sendOpencodeMessage(ticketId, ticketTitle, prompt);

	if (!result.success) {
		return result;
	}

	return { success: true, data: result.data.text };
}
