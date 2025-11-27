import { eq } from "drizzle-orm";
import { fetchFromOpencode } from "@/lib/opencode";
import { db } from "@/server/db";
import { tickets } from "@/server/db/schema";

/**
 * Opencode message part types
 */
interface TextPart {
	type: "text";
	text: string;
}

interface ToolCallPart {
	type: "tool-call";
	toolName: string;
	toolCallId: string;
	args: unknown;
}

interface ToolResultPart {
	type: "tool-result";
	toolCallId: string;
	result: unknown;
}

type MessagePart = TextPart | ToolCallPart | ToolResultPart;

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
 * Extract tool calls from Opencode message parts
 */
function extractToolCalls(
	parts: MessagePart[],
): { toolName: string; toolCallId: string }[] {
	return parts
		.filter((p): p is ToolCallPart => p.type === "tool-call")
		.map((p) => ({ toolName: p.toolName, toolCallId: p.toolCallId }));
}

/**
 * Map Opencode message to chat DTO
 */
function mapToOpencodeChatMessage(msg: OpencodeMessage): OpencodeChatMessage {
	return {
		id: msg.info.id,
		role: msg.info.role,
		text: extractTextFromParts(msg.parts),
		createdAt: new Date(msg.info.createdAt),
		model: msg.info.model
			? `${msg.info.model.providerID}/${msg.info.model.modelID}`
			: undefined,
		toolCalls: extractToolCalls(msg.parts),
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

		const messages = (await response.json()) as OpencodeMessage[];
		const mapped = messages.map(mapToOpencodeChatMessage);

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
	options?: {
		agent?: string;
		providerID?: string;
		modelID?: string;
	},
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
			parts: [{ type: "text", text: userMessage }],
		};

		// Use provided agent or default to docs-agent
		if (options?.agent) {
			payload.agent = options.agent;
		}

		// Use provided model if both providerID and modelID are set
		if (options?.providerID && options?.modelID) {
			payload.model = {
				providerID: options.providerID,
				modelID: options.modelID,
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

		const assistantMessage = (await response.json()) as OpencodeMessage;
		return {
			success: true,
			data: mapToOpencodeChatMessage(assistantMessage),
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
	options?: {
		agent?: string;
		providerID?: string;
		modelID?: string;
	},
): Promise<OpencodeResult<string>> {
	const result = await sendOpencodeMessage(
		ticketId,
		ticketTitle,
		prompt,
		options,
	);

	if (!result.success) {
		return result;
	}

	return { success: true, data: result.data.text };
}
