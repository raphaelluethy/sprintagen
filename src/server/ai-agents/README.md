# AI Agent Providers

Session-based code agents with tool execution capabilities.

## Overview

This module provides AI agent capabilities for interactive code analysis sessions. Unlike the stateless `ai/` module, agents maintain conversation context and can execute tools.

## When to use this vs `ai/`

Use `ai-agents/` when you need **stateful, multi-step interactions** with tools, such as:

- Interactive code review or refactoring sessions
- Maintaining a conversation history over time for a ticket
- Running tools (e.g., code diffs, TODO tracking) as part of the agent flow

For simple **one-off text analysis or generation** without session state, prefer the stateless `ai/` module.

## Architecture

- **AgentRegistry** - Manages available providers with single-active-agent pattern
- **AgentProvider** - Interface for pluggable agent implementations
- **OpencodeProvider** - Primary implementation using the OpenCode SDK

## Key Concepts

### Sessions
Agents work with sessions that maintain conversation history and state:
- `createSession(title)` - Create a new conversation session
- `getSession(id)` - Retrieve an existing session
- `listSessions()` - List all sessions

### Messages
Send and receive messages within a session:
- `sendMessage(sessionId, message)` - Send a message and get response
- `sendMessageAsync(sessionId, message)` - Send without waiting for response
- `getMessages(sessionId)` - Get all messages in a session

### Capabilities
Providers declare their capabilities:
- `sessionStatus` - Can track session status (idle, running, etc.)
- `toolCalls` - Can execute tools
- `sessionDiff` - Can track code changes
- `sessionTodos` - Can track task lists
- `asyncPrompts` - Supports fire-and-forget messages

## Usage

```typescript
import { agentRegistry, OpencodeProvider } from "@/server/ai-agents";

// Register provider (done once at startup)
if (!agentRegistry.has("opencode")) {
  agentRegistry.register(new OpencodeProvider());
}

// Use the active provider
const provider = agentRegistry.getActive();
const session = await provider.createSession("My Analysis");
const response = await provider.sendMessage(session.id, "Analyze this code");
```

## Ticket Integration

For ticket-specific agent operations, use `OpencodeTicketService`:

```typescript
import { opencodeTicketService } from "@/server/tickets/opencode-service";

// Start a session for a ticket
const { sessionId } = await opencodeTicketService.startSession(ticketId, "chat");

// Send a message
const result = await opencodeTicketService.sendMessage(ticketId, sessionId, "How should I implement this?");

// Get chat history
const chat = await opencodeTicketService.getChat(ticketId);
```

## Configuration

- `OPENCODE_SERVER_URL` - OpenCode server URL (default: `http://localhost:4096`)
- `FAST_MODE` - Use fast paid models when available
