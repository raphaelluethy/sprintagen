/**
 * Test Fixtures - Sessions
 *
 * Pre-defined session data for testing.
 */

import type { AgentSession } from "@/types";

export const mockSessions: AgentSession[] = [
	{
		id: "session-1",
		title: "Bug Investigation",
		status: "idle",
		createdAt: new Date("2024-01-15T10:00:00Z"),
	},
	{
		id: "session-2",
		title: "Feature Discussion",
		status: "busy",
		createdAt: new Date("2024-01-15T11:00:00Z"),
	},
	{
		id: "session-3",
		title: "Code Review",
		status: "error",
		createdAt: new Date("2024-01-15T12:00:00Z"),
	},
];

export const mockMessages = [
	{
		id: "msg-1",
		role: "user" as const,
		content: "Hello, I need help with a bug",
		createdAt: new Date("2024-01-15T10:00:00Z"),
	},
	{
		id: "msg-2",
		role: "assistant" as const,
		content: "I'd be happy to help. Can you describe the bug?",
		createdAt: new Date("2024-01-15T10:00:30Z"),
		metadata: {
			model: "opencode/minimax-m2.1-free",
		},
	},
	{
		id: "msg-3",
		role: "user" as const,
		content: "The app crashes when I click the submit button",
		createdAt: new Date("2024-01-15T10:01:00Z"),
	},
];
