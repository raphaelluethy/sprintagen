/**
 * Mock Agent Provider
 *
 * A mock implementation of AgentProvider for testing purposes.
 * Allows configuring responses and simulating various scenarios.
 */

import type {
	AgentMessage,
	AgentProvider,
	AgentSession,
	SendMessageOptions,
} from "../../types";

/**
 * Mock configuration for responses
 */
interface MockConfig {
	/** Default response text */
	defaultResponse?: string;
	/** Responses keyed by message content */
	responses?: Map<string, string>;
	/** Simulate error on next call */
	simulateError?: Error;
	/** Delay responses by milliseconds */
	responseDelay?: number;
}

/**
 * Mock agent provider for testing
 *
 * Provides controllable AI agent behavior for unit and integration tests.
 *
 * @example
 * ```typescript
 * const mock = new MockAgentProvider();
 *
 * // Configure responses
 * mock.setResponse("hello", "Hi there!");
 * mock.setDefaultResponse("I don't understand.");
 *
 * // Use in tests
 * const session = await mock.createSession("Test");
 * const response = await mock.sendMessage(session.id, "hello");
 * expect(response.content).toBe("Hi there!");
 * ```
 */
export class MockAgentProvider implements AgentProvider {
	readonly name = "mock";

	private sessions = new Map<string, AgentSession>();
	private messages = new Map<string, AgentMessage[]>();
	private config: MockConfig = {};
	private messageIdCounter = 0;

	/**
	 * Configure the mock provider
	 */
	configure(config: MockConfig): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Set the default response for unmatched messages
	 */
	setDefaultResponse(response: string): void {
		this.config.defaultResponse = response;
	}

	/**
	 * Set a specific response for a message
	 */
	setResponse(trigger: string, response: string): void {
		if (!this.config.responses) {
			this.config.responses = new Map();
		}
		this.config.responses.set(trigger.toLowerCase(), response);
	}

	/**
	 * Simulate an error on the next call
	 */
	simulateError(error: Error): void {
		this.config.simulateError = error;
	}

	/**
	 * Clear any pending error simulation
	 */
	clearError(): void {
		this.config.simulateError = undefined;
	}

	/**
	 * Reset all state
	 */
	reset(): void {
		this.sessions.clear();
		this.messages.clear();
		this.config = {};
		this.messageIdCounter = 0;
	}

	// AgentProvider implementation

	isConfigured(): boolean {
		return true;
	}

	async checkHealth(): Promise<boolean> {
		if (this.config.simulateError) {
			const error = this.config.simulateError;
			this.config.simulateError = undefined;
			throw error;
		}
		return true;
	}

	async createSession(title?: string): Promise<AgentSession> {
		await this.maybeDelay();
		this.checkError();

		const id = `mock-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const session: AgentSession = {
			id,
			title,
			status: "idle",
			createdAt: new Date(),
		};

		this.sessions.set(id, session);
		this.messages.set(id, []);

		return session;
	}

	async getSession(sessionId: string): Promise<AgentSession | null> {
		await this.maybeDelay();
		this.checkError();

		return this.sessions.get(sessionId) ?? null;
	}

	async listSessions(): Promise<AgentSession[]> {
		await this.maybeDelay();
		this.checkError();

		return Array.from(this.sessions.values());
	}

	async sendMessage(
		sessionId: string,
		message: string,
		_options?: SendMessageOptions,
	): Promise<AgentMessage> {
		await this.maybeDelay();
		this.checkError();

		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} not found`);
		}

		// Store user message
		const userMessage: AgentMessage = {
			id: `msg-${++this.messageIdCounter}`,
			role: "user",
			content: message,
			createdAt: new Date(),
		};

		const sessionMessages = this.messages.get(sessionId) ?? [];
		sessionMessages.push(userMessage);

		// Generate response
		const responseText = this.getResponse(message);
		const assistantMessage: AgentMessage = {
			id: `msg-${++this.messageIdCounter}`,
			role: "assistant",
			content: responseText,
			createdAt: new Date(),
			metadata: {
				model: "mock/test-model",
			},
		};

		sessionMessages.push(assistantMessage);
		this.messages.set(sessionId, sessionMessages);

		return assistantMessage;
	}

	async getMessages(sessionId: string): Promise<AgentMessage[]> {
		await this.maybeDelay();
		this.checkError();

		return this.messages.get(sessionId) ?? [];
	}

	supportsStreaming(): boolean {
		return false;
	}

	// Private helpers

	private getResponse(message: string): string {
		// Check for specific response
		if (this.config.responses) {
			const response = this.config.responses.get(message.toLowerCase());
			if (response) return response;
		}

		// Return default or fallback
		return this.config.defaultResponse ?? `Mock response to: ${message}`;
	}

	private async maybeDelay(): Promise<void> {
		if (this.config.responseDelay && this.config.responseDelay > 0) {
			await new Promise((resolve) =>
				setTimeout(resolve, this.config.responseDelay),
			);
		}
	}

	private checkError(): void {
		if (this.config.simulateError) {
			const error = this.config.simulateError;
			this.config.simulateError = undefined;
			throw error;
		}
	}
}
