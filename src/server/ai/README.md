# AI Text Providers

Stateless LLM providers for one-shot text generation and analysis.

## Overview

This module provides AI text generation capabilities for ticket analysis, ranking, and recommendations. It uses a provider abstraction to support multiple LLM backends.

## When to use this vs `ai-agents/`

Use this `ai/` module when you need **one-shot, stateless text operations**, such as:

- Classifying or analyzing a single ticket
- Generating recommendations, rankings, or summaries from a fixed input
- Getting structured JSON output from a single prompt

For **interactive, multi-turn code analysis or edits tied to sessions or tickets**, use the `ai-agents/` module instead.

## Providers

- **OpenRouter** - Primary provider for paid models (GPT-4, Claude, etc.)
- **Cerebras** - Alternative fast inference provider (Llama models)

## Key Functions

- `analyzeWithAI(system, user)` - Send a prompt to the configured provider
- `getActiveAIProvider()` - Get the currently configured provider
- `buildRankingPrompt(tickets)` - Build prompts for ticket ranking
- `buildRecommendedStepsPrompt(ticket)` - Build prompts for implementation recommendations
- `buildRecommendedProgrammerPrompt(ticket, programmers)` - Build prompts for programmer recommendations
- `parseJsonResponse<T>(text)` - Parse JSON from AI response

## Configuration

Set one of:
- `OPENROUTER_API_KEY` - For OpenRouter
- `CEREBRAS_API_KEY` - For Cerebras

## Usage

```typescript
import { analyzeWithAI, buildRankingPrompt, getActiveAIProvider } from "@/server/ai";

// Check configuration
if (getActiveAIProvider() !== "none") {
  const { system, user } = buildRankingPrompt(tickets);
  const result = await analyzeWithAI(system, user);
  console.log(result.text);
}
```
