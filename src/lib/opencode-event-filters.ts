import type { Event } from "@opencode-ai/sdk";

export function isEventForSession(event: Event, sessionId: string): boolean {
	switch (event.type) {
		case "session.created":
		case "session.updated":
		case "session.deleted":
			return event.properties.info.id === sessionId;

		case "message.updated":
			return event.properties.info.sessionID === sessionId;

		case "message.removed":
			return event.properties.sessionID === sessionId;

		case "message.part.updated":
			return event.properties.part.sessionID === sessionId;

		case "message.part.removed":
			return event.properties.sessionID === sessionId;

		case "session.status":
		case "session.idle":
		case "session.diff":
		case "todo.updated":
		case "session.compacted":
			return event.properties.sessionID === sessionId;

		case "session.error":
			return event.properties.sessionID === sessionId;

		default:
			return false;
	}
}

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

export function isSessionRelevantEvent(
	event: Event,
): event is Extract<Event, { type: SessionRelevantEventType }> {
	return SESSION_RELEVANT_EVENT_TYPES.includes(
		event.type as SessionRelevantEventType,
	);
}
