/**
 * OpenCode Event Listener Service
 *
 * Singleton service that subscribes to OpenCode's native SSE via `client.global.event()`.
 * On each event: stores in Redis + publishes to pub/sub channel for real-time UI updates.
 */

import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Event, GlobalEvent, Part } from "@opencode-ai/sdk";
import { isRedisAvailable, redis } from "@/server/redis";
import { getOpencodeStore, OpencodeKeys } from "@/server/redis/opencode-store";
import { getOpencodeClient } from "./opencode-client";

const logsDir = join(process.cwd(), "logs");
const lastLoggedEventKey = new Map<string, string>();
const finalSnapshotLogged = new Set<string>();

/**
 * Ensure logs directory exists
 */
async function ensureLogsDir(): Promise<void> {
	try {
		await mkdir(logsDir, { recursive: true });
	} catch {
		// Directory might already exist
	}
}

/**
 * Get log file path for a session (deterministic based on sessionId and ticketId)
 */
function getLogFilePath(sessionId: string, ticketId?: string): string {
	const ticketPart = ticketId || "no-ticket";
	const sessionPart = sessionId.substring(0, 8);
	const filename = `${ticketPart}-${sessionPart}.md`;
	return join(logsDir, filename);
}

/**
 * Initialize log file with header if it doesn't exist
 */
async function initLogFile(
	filepath: string,
	sessionId: string,
	ticketId?: string,
): Promise<void> {
	if (existsSync(filepath)) {
		return; // File already exists, don't overwrite header
	}

	const header = `# OpenCode Event Log

- **Session ID**: \`${sessionId}\`
- **Ticket ID**: ${ticketId ? `\`${ticketId}\`` : "N/A"}
- **Started**: ${new Date().toISOString()}

---
`;
	await writeFile(filepath, header, "utf-8");
	console.log(`[EVENT-LISTENER] Created log file: ${filepath}`);
}

/**
 * Write event to log file
 */
async function logEventToFile(
	sessionId: string,
	event: Event,
	ticketId?: string,
): Promise<void> {
	try {
		await ensureLogsDir();
		const filepath = getLogFilePath(sessionId, ticketId);

		// Initialize file with header if needed
		await initLogFile(filepath, sessionId, ticketId);

		const serialized = JSON.stringify(event);
		const lastKey = lastLoggedEventKey.get(sessionId);
		if (lastKey === serialized) {
			return; // Skip duplicate consecutive events for this session
		}
		lastLoggedEventKey.set(sessionId, serialized);

		const timestamp = new Date().toISOString();
		let content = `\n## ${timestamp} - ${event.type}\n\n`;

		// Add event-specific details
		if (event.type === "message.updated") {
			const msg = event.properties.info;
			content += `- **Message ID**: \`${msg.id}\`\n`;
			content += `- **Role**: ${msg.role}\n`;
			content += `- **Session**: \`${msg.sessionID}\`\n`;
		} else if (event.type === "message.part.updated") {
			const part = event.properties.part;
			content += `- **Part ID**: \`${part.id}\`\n`;
			content += `- **Type**: ${part.type}\n`;
			content += `- **Message ID**: \`${part.messageID}\`\n`;

			if (part.type === "text") {
				const textPart = part as { text: string };
				content += `\n### Text Content\n\n\`\`\`\n${textPart.text}\n\`\`\`\n`;
			} else if (part.type === "tool") {
				const toolPart = part as {
					tool: string;
					callID: string;
					state: { status: string; input?: unknown; output?: string };
				};
				content += `- **Tool**: ${toolPart.tool}\n`;
				content += `- **Call ID**: \`${toolPart.callID}\`\n`;
				content += `- **Status**: ${toolPart.state.status}\n`;
				if (toolPart.state.input) {
					content += `\n### Input\n\n\`\`\`json\n${JSON.stringify(toolPart.state.input, null, 2)}\n\`\`\`\n`;
				}
				if (toolPart.state.output) {
					content += `\n### Output\n\n\`\`\`\n${toolPart.state.output.substring(0, 1000)}${toolPart.state.output.length > 1000 ? "..." : ""}\n\`\`\`\n`;
				}
			} else if (part.type === "reasoning") {
				const reasoningPart = part as { text: string };
				content += `\n### Reasoning\n\n${reasoningPart.text}\n`;
			}
		} else if (event.type === "session.status") {
			content += `- **Session ID**: \`${event.properties.sessionID}\`\n`;
			content += `- **Status**: ${event.properties.status.type}\n`;
		} else if (event.type === "session.idle") {
			content += `- **Session ID**: \`${event.properties.sessionID}\`\n`;
			content += `- **Status**: idle (completed)\n`;
		} else {
			// For other events, just log the raw JSON
			content += `\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\`\n`;
		}

		content += "\n---\n";

		await appendFile(filepath, content, "utf-8");
	} catch (error) {
		console.error(
			"[EVENT-LISTENER] Failed to write to log file:",
			error instanceof Error ? error.message : error,
		);
	}
}

async function logFinalSessionSnapshot(
	sessionId: string,
	directory: string,
	ticketId?: string,
): Promise<void> {
	if (finalSnapshotLogged.has(sessionId)) {
		return;
	}
	try {
		const client = getOpencodeClient();
		const store = getOpencodeStore();
		const sessionRes = await client.session.get({ path: { id: sessionId } });
		const messagesRes = await client.session.messages({
			path: { id: sessionId },
		});

		// Persist the final state into Redis to ensure full-text hydration
		if (messagesRes.data) {
			for (const message of messagesRes.data) {
				await store.upsertMessage(message.info);
				for (const part of message.parts) {
					await store.upsertPart(part as Part & { delta?: string });
				}
			}
		}
		if (sessionRes.data) {
			await store.upsertSession(sessionRes.data);
		}

		await ensureLogsDir();
		const filepath = getLogFilePath(sessionId, ticketId);
		await initLogFile(filepath, sessionId, ticketId);

		const snapshot = {
			directory,
			session: sessionRes.data ?? null,
			messages: messagesRes.data ?? [],
		};

		const content = `\n## Final Session Snapshot\n\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n`;
		await appendFile(filepath, content, "utf-8");
		finalSnapshotLogged.add(sessionId);
	} catch (error) {
		console.error(
			"[EVENT-LISTENER] Failed to write final session snapshot:",
			error instanceof Error ? error.message : error,
		);
	}
}

type EventStream = AsyncIterable<GlobalEvent>;

interface ListenerState {
	isRunning: boolean;
	abortController: AbortController | null;
	reconnectTimeout: NodeJS.Timeout | null;
	reconnectAttempts: number;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

class OpencodeEventListener {
	private state: ListenerState = {
		isRunning: false,
		abortController: null,
		reconnectTimeout: null,
		reconnectAttempts: 0,
	};

	/**
	 * Start listening to OpenCode events
	 */
	async start(): Promise<void> {
		if (this.state.isRunning) {
			console.log("[EVENT-LISTENER] Already running");
			return;
		}

		this.state.isRunning = true;
		this.state.reconnectAttempts = 0;

		console.log("[EVENT-LISTENER] Starting event listener...");
		await this.connect();
	}

	/**
	 * Stop the event listener
	 */
	stop(): void {
		console.log("[EVENT-LISTENER] Stopping event listener...");
		this.state.isRunning = false;

		if (this.state.abortController) {
			this.state.abortController.abort();
			this.state.abortController = null;
		}

		if (this.state.reconnectTimeout) {
			clearTimeout(this.state.reconnectTimeout);
			this.state.reconnectTimeout = null;
		}
	}

	/**
	 * Check if the listener is running
	 */
	isRunning(): boolean {
		return this.state.isRunning;
	}

	/**
	 * Connect to the OpenCode event stream
	 */
	private async connect(): Promise<void> {
		if (!this.state.isRunning) {
			console.log("[EVENT-LISTENER] Not running, skipping connection");
			return;
		}

		try {
			const client = getOpencodeClient();
			console.log("[EVENT-LISTENER] Connecting to global event stream...");

			// Create abort controller for this connection
			this.state.abortController = new AbortController();

			// Subscribe to global events
			// The SDK returns { stream: AsyncGenerator<GlobalEvent> }
			const result = await client.global.event({
				signal: this.state.abortController.signal,
			});

			console.log("[EVENT-LISTENER] Connected to global event stream");
			this.state.reconnectAttempts = 0;

			// Process the event stream - result.stream is the AsyncGenerator
			await this.processStream(result.stream as unknown as EventStream);
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				console.log("[EVENT-LISTENER] Connection aborted");
				return;
			}

			const message = error instanceof Error ? error.message : "Unknown error";
			console.error("[EVENT-LISTENER] Connection error:", message);

			// Attempt to reconnect
			this.scheduleReconnect();
		}
	}

	/**
	 * Process the event stream
	 */
	private async processStream(stream: EventStream): Promise<void> {
		try {
			for await (const globalEvent of stream) {
				if (!this.state.isRunning) {
					console.log("[EVENT-LISTENER] Stopped, exiting stream processing");
					break;
				}

				await this.handleEvent(globalEvent);
			}

			console.log("[EVENT-LISTENER] Stream ended");

			// Stream ended normally - try to reconnect
			if (this.state.isRunning) {
				this.scheduleReconnect();
			}
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				return;
			}

			const message = error instanceof Error ? error.message : "Unknown error";
			console.error("[EVENT-LISTENER] Stream processing error:", message);

			if (this.state.isRunning) {
				this.scheduleReconnect();
			}
		}
	}

	/**
	 * Handle a single global event
	 */
	private async handleEvent(globalEvent: GlobalEvent): Promise<void> {
		const { directory, payload } = globalEvent;
		const event = payload as Event;

		// Get the session ID from the event (different events have it in different places)
		const sessionId = this.extractSessionId(event);

		// Log event with details for debugging
		console.log(
			`[EVENT-LISTENER] Received ${event.type} | session: ${sessionId ?? "N/A"} | dir: ${directory}`,
		);

		// Log more details for important event types
		if (event.type === "message.updated") {
			const msg = event.properties.info;
			console.log(
				`[EVENT-LISTENER]   → message.updated: id=${msg.id}, role=${msg.role}, sessionID=${msg.sessionID}`,
			);
		} else if (event.type === "message.part.updated") {
			const part = event.properties.part;
			console.log(
				`[EVENT-LISTENER]   → message.part.updated: id=${part.id}, type=${part.type}, messageID=${part.messageID}`,
			);
			if (part.type === "text") {
				const textPart = part as { text: string };
				console.log(
					`[EVENT-LISTENER]   → text content (first 100 chars): "${textPart.text.substring(0, 100)}..."`,
				);
			} else if (part.type === "tool") {
				const toolPart = part as { tool: string; state: { status: string } };
				console.log(
					`[EVENT-LISTENER]   → tool: ${toolPart.tool}, status=${toolPart.state.status}`,
				);
			}
		} else if (event.type === "session.status") {
			console.log(
				`[EVENT-LISTENER]   → session.status: sessionID=${event.properties.sessionID}, status=${event.properties.status.type}`,
			);
		} else if (event.type === "session.idle") {
			console.log(
				`[EVENT-LISTENER]   → session.idle: sessionID=${event.properties.sessionID}`,
			);
		}

		try {
			// Store the event in Redis
			const store = getOpencodeStore();
			await store.handleEvent(event);

			// Try to get ticketId from tracked session for logging
			let ticketId: string | undefined;
			if (sessionId) {
				const trackedSession = await store.getTrackedSession(sessionId);
				ticketId = trackedSession?.ticketId;
			}

			// Log event to file for debugging
			if (sessionId) {
				await logEventToFile(sessionId, event, ticketId);
				if (event.type === "session.idle") {
					await logFinalSessionSnapshot(sessionId, directory, ticketId);
				}
			}

			// Publish to Redis pub/sub for real-time subscriptions
			if (sessionId && isRedisAvailable()) {
				// Publish to session-specific channel
				const channel = OpencodeKeys.sessionEvents(sessionId);
				const published = await redis.publish(
					channel,
					JSON.stringify({ directory, event }),
				);
				console.log(
					`[EVENT-LISTENER] Published to ${channel}: ${published ? "OK" : "FAILED"}`,
				);
			}

			// Always publish to global channel
			if (isRedisAvailable()) {
				await redis.publish(
					OpencodeKeys.globalEvents(),
					JSON.stringify({ directory, event }),
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			console.error(`[EVENT-LISTENER] Error handling ${event.type}:`, message);
		}
	}

	/**
	 * Extract session ID from various event types
	 */
	private extractSessionId(event: Event): string | null {
		switch (event.type) {
			case "session.created":
			case "session.updated":
			case "session.deleted":
				return event.properties.info.id;

			case "session.status":
			case "session.idle":
			case "session.compacted":
			case "session.diff":
			case "todo.updated":
			case "command.executed":
				return event.properties.sessionID;

			case "session.error":
				return event.properties.sessionID ?? null;

			case "message.updated":
				return event.properties.info.sessionID;

			case "message.removed":
				return event.properties.sessionID;

			case "message.part.updated":
				return event.properties.part.sessionID;

			case "message.part.removed":
				return event.properties.sessionID;

			default:
				return null;
		}
	}

	/**
	 * Schedule a reconnection attempt with exponential backoff
	 */
	private scheduleReconnect(): void {
		if (!this.state.isRunning) {
			return;
		}

		if (this.state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			console.error(
				"[EVENT-LISTENER] Max reconnect attempts reached, stopping",
			);
			this.state.isRunning = false;
			return;
		}

		// Exponential backoff with jitter
		const delay = Math.min(
			BASE_RECONNECT_DELAY_MS * 2 ** this.state.reconnectAttempts +
				Math.random() * 1000,
			MAX_RECONNECT_DELAY_MS,
		);

		this.state.reconnectAttempts++;

		console.log(
			`[EVENT-LISTENER] Reconnecting in ${Math.round(delay)}ms ` +
				`(attempt ${this.state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
		);

		this.state.reconnectTimeout = setTimeout(() => {
			this.state.reconnectTimeout = null;
			this.connect();
		}, delay);
	}
}

// Singleton instance
let listenerInstance: OpencodeEventListener | null = null;

/**
 * Get the singleton event listener instance
 */
export function getEventListener(): OpencodeEventListener {
	if (!listenerInstance) {
		listenerInstance = new OpencodeEventListener();
	}
	return listenerInstance;
}

/**
 * Start the event listener (idempotent)
 */
export async function startEventListener(): Promise<void> {
	const listener = getEventListener();
	if (!listener.isRunning()) {
		await listener.start();
	}
}

/**
 * Stop the event listener
 */
export function stopEventListener(): void {
	if (listenerInstance) {
		listenerInstance.stop();
	}
}
