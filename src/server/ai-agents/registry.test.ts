import { describe, expect, it, mock } from "bun:test";
import { MockAgentProvider } from "./providers/mock";
import { AgentRegistry } from "./registry";

describe("AgentRegistry", () => {
	it("registers a provider", () => {
		const registry = new AgentRegistry();
		const provider = new MockAgentProvider();

		registry.register(provider);

		expect(registry.has("mock")).toBe(true);
		expect(registry.get("mock")).toBe(provider);
	});

	it("auto-activates first registered provider", () => {
		const registry = new AgentRegistry();
		const provider = new MockAgentProvider();

		registry.register(provider);

		expect(registry.getActiveName()).toBe("mock");
		expect(registry.getActive()).toBe(provider);
	});

	it("throws when registering duplicate provider", () => {
		const registry = new AgentRegistry();
		registry.register(new MockAgentProvider());

		expect(() => registry.register(new MockAgentProvider())).toThrow(
			'Provider "mock" is already registered',
		);
	});

	it("allows setting active provider", () => {
		const registry = new AgentRegistry();
		const mock1 = new MockAgentProvider();

		// Create a second provider with different name
		const mock2 = {
			...new MockAgentProvider(),
			name: "mock2",
		};

		registry.register(mock1);
		registry.register(mock2 as MockAgentProvider);

		registry.setActive("mock2");

		expect(registry.getActiveName()).toBe("mock2");
	});

	it("throws when setting non-existent provider as active", () => {
		const registry = new AgentRegistry();

		expect(() => registry.setActive("nonexistent")).toThrow(
			'Provider "nonexistent" is not registered',
		);
	});

	it("throws when getting active with no providers", () => {
		const registry = new AgentRegistry();

		expect(() => registry.getActive()).toThrow("No active provider set");
	});

	it("lists available providers", () => {
		const registry = new AgentRegistry();
		registry.register(new MockAgentProvider());

		const mock2 = {
			...new MockAgentProvider(),
			name: "mock2",
		};
		registry.register(mock2 as MockAgentProvider);

		const available = registry.listAvailable();

		expect(available).toContain("mock");
		expect(available).toContain("mock2");
		expect(available).toHaveLength(2);
	});

	it("emits events on provider registration", () => {
		const registry = new AgentRegistry();
		const listener = mock(() => {});

		registry.subscribe(listener);
		registry.register(new MockAgentProvider());

		expect(listener).toHaveBeenCalledWith({
			type: "provider-registered",
			name: "mock",
		});
		expect(listener).toHaveBeenCalledWith({
			type: "provider-activated",
			name: "mock",
		});
	});

	it("allows unsubscribing from events", () => {
		const registry = new AgentRegistry();
		const listener = mock(() => {});

		const unsubscribe = registry.subscribe(listener);
		unsubscribe();

		registry.register(new MockAgentProvider());

		expect(listener).not.toHaveBeenCalled();
	});
});
