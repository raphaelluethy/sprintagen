# Cerebras Provider Setup for OpenCode

This document describes how to configure Cerebras as an AI provider for OpenCode serve.

## Overview

Cerebras is a built-in provider in OpenCode that uses the `@ai-sdk/cerebras` package. It provides access to high-performance models like Qwen 3 Coder 480B and Llama variants.

## Getting Your API Key

1. Visit [Cerebras Inference](https://inference.cerebras.ai/)
2. Create an account or sign in
3. Generate an API key from the dashboard

## Configuration Methods

### Option 1: Environment Variables (Recommended)

Set these variables in your `.env` file:

```bash
OPENCODE_PROVIDER_ID=cerebras
OPENCODE_PROVIDER_API_KEY=your-cerebras-api-key
```

The OpenCode serve process will automatically pick up these credentials on startup.

### Option 2: Direct API Call to OpenCode

Authenticate directly with the OpenCode server:

```bash
# PUT /auth/cerebras (to OpenCode serve on port 4096)
curl -X PUT http://localhost:4096/auth/cerebras \
  -H "Content-Type: application/json" \
  -d '{"type": "api", "key": "your-cerebras-api-key"}'
```

### Option 3: Via Project Wrapper Endpoint

Use the project's authentication endpoint:

```bash
# POST /api/opencode/auth
curl -X POST http://localhost:3000/api/opencode/auth \
  -H "Content-Type: application/json" \
  -d '{"providerId": "cerebras", "key": "your-api-key"}'
```

## Model Configuration

The project is configured to use `cerebras/zai-glm-4.6` as the default model. This is set in `.opencode/opencode.jsonc`.

### Model Format

Models follow the format: `cerebras/<model-id>`

Examples:
- `cerebras/zai-glm-4.6` (default)
- `cerebras/llama-3.3-70b`

## Using Cerebras in Messages

When sending messages to a session, specify the Cerebras model:

```typescript
// POST /session/{id}/message
{
  "model": {
    "providerID": "cerebras",
    "modelID": "zai-glm-4.6"
  },
  "parts": [{ "type": "text", "text": "Your prompt here" }]
}
```

## Verifying Setup

Check available providers via the API:

```bash
curl http://localhost:3000/api/opencode/providers
```

The response should include Cerebras in the list of configured providers.

## Troubleshooting

- **Provider not showing**: Ensure `OPENCODE_PROVIDER_ID` and `OPENCODE_PROVIDER_API_KEY` are set correctly
- **Authentication errors**: Verify your API key is valid at https://inference.cerebras.ai/
- **Model not found**: Ensure you're using the correct model ID format (`cerebras/<model-id>`)
