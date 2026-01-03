/**
 * Agent Registry
 *
 * Manages available AI agent providers with a single-active-agent pattern.
 * Only one agent provider is active at a time, switchable via configuration.
 */

import type { AgentProvider, AgentRegistryEvent } from "./types";

type EventListener = (event: AgentRegistryEvent) => void;

/**
 * Registry for AI agent providers
 *
 * Implements a single-active-agent pattern where only one provider
 * is active at a time, but multiple can be registered.
 *
 * @example
 * ```typescript
 * const registry = new AgentRegistry();
 *
 * // Register providers
 * registry.register(new OpencodeProvider());
 * registry.register(new MockProvider());
 *
 * // Set active provider
 * registry.setActive("opencode");
 *
 * // Use active provider
 * const provider = registry.getActive();
 * await provider.sendMessage(sessionId, "Hello");
 * ```
 */
export class AgentRegistry {
	private providers = new Map<string, AgentProvider>();
	private activeProviderName: string | null = null;
	private listeners: EventListener[] = [];

	/**
	 * Register a new agent provider
	 *
	 * @param provider - The provider to register
	 * @throws Error if provider with same name already exists
	 */
	register(provider: AgentProvider): void {
		if (this.providers.has(provider.name)) {
			throw new Error(`Provider "${provider.name}" is already registered`);
		}

		this.providers.set(provider.name, provider);
		this.emit({ type: "provider-registered", name: provider.name });

		// Auto-activate first registered provider
		if (this.activeProviderName === null) {
			this.activeProviderName = provider.name;
			this.emit({ type: "provider-activated", name: provider.name });
		}
	}

	/**
	 * Get a provider by name
	 *
	 * @param name - Provider name
	 * @returns The provider or undefined if not found
	 */
	get(name: string): AgentProvider | undefined {
		return this.providers.get(name);
	}

	/**
	 * Set the active provider
	 *
	 * @param name - Provider name to activate
	 * @throws Error if provider not found
	 */
	setActive(name: string): void {
		const provider = this.providers.get(name);
		if (!provider) {
			throw new Error(`Provider "${name}" is not registered`);
		}

		this.activeProviderName = name;
		this.emit({ type: "provider-activated", name });
	}

	/**
	 * Get the currently active provider
	 *
	 * @returns The active provider
	 * @throws Error if no provider is active
	 */
	getActive(): AgentProvider {
		if (!this.activeProviderName) {
			throw new Error("No active provider set");
		}

		const provider = this.providers.get(this.activeProviderName);
		if (!provider) {
			throw new Error(`Active provider "${this.activeProviderName}" not found`);
		}

		return provider;
	}

	/**
	 * Get the name of the active provider
	 */
	getActiveName(): string | null {
		return this.activeProviderName;
	}

	/**
	 * Check if a provider with the given name exists
	 */
	has(name: string): boolean {
		return this.providers.has(name);
	}

	/**
	 * List all registered provider names
	 */
	listAvailable(): string[] {
		return Array.from(this.providers.keys());
	}

	/**
	 * List all registered providers
	 */
	listProviders(): AgentProvider[] {
		return Array.from(this.providers.values());
	}

	/**
	 * Subscribe to registry events
	 *
	 * @param listener - Event listener function
	 * @returns Unsubscribe function
	 */
	subscribe(listener: EventListener): () => void {
		this.listeners.push(listener);
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index > -1) {
				this.listeners.splice(index, 1);
			}
		};
	}

	private emit(event: AgentRegistryEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error("[AgentRegistry] Error in event listener:", error);
			}
		}
	}
}

/**
 * Global singleton registry instance
 */
export const agentRegistry = new AgentRegistry();
