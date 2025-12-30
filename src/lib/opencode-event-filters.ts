import type { Event } from "@opencode-ai/sdk";

/**
 * Check if an event belongs to a specific session.
 * Events have different property structures, so we need to check each type.
 */
export function isEventForSession(event: Event, sessionId: string): boolean {
	switch (event.type) {
		// Session lifecycle events: session info has `id`
		case "session.created":
		case "session.updated":
		case "session.deleted":
			return event.properties.info.id === sessionId;

		// Message events: message info has `sessionID`
		case "message.updated":
			return event.properties.info.sessionID === sessionId;

		case "message.removed":
			return event.properties.sessionID === sessionId;

		// Message part events: part has `sessionID`
		case "message.part.updated":
			return event.properties.part.sessionID === sessionId;

		case "message.part.removed":
			return event.properties.sessionID === sessionId;

		// Session status events: direct `sessionID` property
		case "session.status":
		case "session.idle":
		case "session.diff":
		case "todo.updated":
		case "session.compacted":
			return event.properties.sessionID === sessionId;

		// Session error: optional sessionID
		case "session.error":
			return event.properties.sessionID === sessionId;

		// Events not associated with a specific session - return false by default
		default:
			return false;
	}
}

/**
 * Event types that are relevant for session streaming.
 * Used to filter out server-wide events we don't care about.
 */
export const SESSION_RELEVANT_EVENT_TYPES = [
	"session.created",
	"session.updated",
	"session.deleted",
	"message.updated",
	"message.removed",
	"message.part.updated",
	"message.part.removed",
	"session.status",
	"session.idle",
	"session.diff",
	"session.error",
	"todo.updated",
] as const;

export type SessionRelevantEventType =
	(typeof SESSION_RELEVANT_EVENT_TYPES)[number];

/**
 * Check if an event type is relevant for session streaming.
 */
export function isSessionRelevantEvent(
	event: Event,
): event is Extract<Event, { type: SessionRelevantEventType }> {
	return SESSION_RELEVANT_EVENT_TYPES.includes(
		event.type as SessionRelevantEventType,
	);
}
