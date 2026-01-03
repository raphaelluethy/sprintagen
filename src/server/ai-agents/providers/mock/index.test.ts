import { describe, expect, it } from "bun:test";
import { MockAgentProvider } from "./index";

describe("MockAgentProvider", () => {
	it("creates sessions", async () => {
		const provider = new MockAgentProvider();

		const session = await provider.createSession("Test Session");

		expect(session.id).toBeDefined();
		expect(session.title).toBe("Test Session");
		expect(session.status).toBe("idle");
		expect(session.createdAt).toBeInstanceOf(Date);
	});

	it("retrieves created sessions", async () => {
		const provider = new MockAgentProvider();

		const created = await provider.createSession("Test");
		const retrieved = await provider.getSession(created.id);

		expect(retrieved).toEqual(created);
	});

	it("returns null for non-existent sessions", async () => {
		const provider = new MockAgentProvider();

		const session = await provider.getSession("non-existent");

		expect(session).toBeNull();
	});

	it("lists all sessions", async () => {
		const provider = new MockAgentProvider();

		await provider.createSession("Session 1");
		await provider.createSession("Session 2");

		const sessions = await provider.listSessions();

		expect(sessions).toHaveLength(2);
	});

	it("sends messages and receives responses", async () => {
		const provider = new MockAgentProvider();
		const session = await provider.createSession("Test");

		const response = await provider.sendMessage(session.id, "Hello");

		expect(response.role).toBe("assistant");
		expect(response.content).toContain("Hello");
	});

	it("uses default response when configured", async () => {
		const provider = new MockAgentProvider();
		provider.setDefaultResponse("Default reply");

		const session = await provider.createSession("Test");
		const response = await provider.sendMessage(session.id, "Anything");

		expect(response.content).toBe("Default reply");
	});

	it("uses specific response when trigger matches", async () => {
		const provider = new MockAgentProvider();
		provider.setResponse("hello", "Hi there!");
		provider.setDefaultResponse("Unknown");

		const session = await provider.createSession("Test");

		const response1 = await provider.sendMessage(session.id, "hello");
		const response2 = await provider.sendMessage(session.id, "goodbye");

		expect(response1.content).toBe("Hi there!");
		expect(response2.content).toBe("Unknown");
	});

	it("stores message history", async () => {
		const provider = new MockAgentProvider();
		const session = await provider.createSession("Test");

		await provider.sendMessage(session.id, "Message 1");
		await provider.sendMessage(session.id, "Message 2");

		const messages = await provider.getMessages(session.id);

		expect(messages).toHaveLength(4); // 2 user + 2 assistant
		expect(messages[0]?.content).toBe("Message 1");
		expect(messages[1]?.role).toBe("assistant");
	});

	it("simulates errors when configured", async () => {
		const provider = new MockAgentProvider();
		provider.simulateError(new Error("Simulated failure"));

		expect(provider.checkHealth()).rejects.toThrow("Simulated failure");
	});

	it("clears error after it fires", async () => {
		const provider = new MockAgentProvider();
		provider.simulateError(new Error("One-time error"));

		expect(provider.checkHealth()).rejects.toThrow();
		expect(provider.checkHealth()).resolves.toBe(true);
	});

	it("resets all state", async () => {
		const provider = new MockAgentProvider();
		await provider.createSession("Test");
		provider.setDefaultResponse("Custom");

		provider.reset();

		const sessions = await provider.listSessions();
		expect(sessions).toHaveLength(0);
	});

	it("reports as always configured", () => {
		const provider = new MockAgentProvider();

		expect(provider.isConfigured()).toBe(true);
	});

	it("does not support streaming", () => {
		const provider = new MockAgentProvider();

		expect(provider.supportsStreaming()).toBe(false);
	});

	it("throws when sending to non-existent session", async () => {
		const provider = new MockAgentProvider();

		expect(provider.sendMessage("non-existent", "Hello")).rejects.toThrow(
			"Session non-existent not found",
		);
	});
});
