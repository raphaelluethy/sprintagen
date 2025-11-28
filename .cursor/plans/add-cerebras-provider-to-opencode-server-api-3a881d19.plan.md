<!-- 3a881d19-2c89-4b15-97dc-fdbc3229c48a baf07a6b-da4a-425f-bca5-dbd2f8d266d6 -->
# Add Cerebras Provider to OpenCode Server API

## Verified from opencode_repo

From `packages/web/src/content/docs/providers.mdx` lines 324-356:

- Cerebras is a **built-in provider** in OpenCode
- Uses `@ai-sdk/cerebras` npm package (line 1370)
- Get API key from https://inference.cerebras.ai/
- Models include "Qwen 3 Coder 480B" and others

**Model format:** `cerebras/<model-id>` (e.g., `cerebras/llama-3.3-70b`)

## Server API Authentication

### Option 1: Environment Variables (Recommended)

```bash
# In .env
OPENCODE_PROVIDER_ID=cerebras
OPENCODE_PROVIDER_API_KEY=your-cerebras-api-key
```

Get API key from https://inference.cerebras.ai/

### Option 2: Direct API Call

```bash
# PUT /auth/cerebras (to OpenCode serve)
curl -X PUT http://localhost:4096/auth/cerebras \
  -H "Content-Type: application/json" \
  -d '{"type": "api", "key": "your-cerebras-api-key"}'
```

Or via the project's wrapper endpoint:

```bash
# POST /api/opencode/auth
curl -X POST http://localhost:3000/api/opencode/auth \
  -H "Content-Type: application/json" \
  -d '{"providerId": "cerebras", "key": "your-api-key"}'
```

## Using Cerebras in Messages

```typescript
// POST /session/{id}/message
{
  "model": {
    "providerID": "cerebras",
    "modelID": "llama-3.3-70b"
  },
  "parts": [{ "type": "text", "text": "Your prompt here" }]
}
```

## Target Model

- Model ID: `zai-glm-4.6`
- Full path: `cerebras/zai-glm-4.6`

## Changes Required

### 1. Create `.opencode/opencode.jsonc` Config

Set Cerebras as the default provider with zai-glm-4.6:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "cerebras/zai-glm-4.6"
}
```

### 2. Verify `.env.example`

The file already has `CEREBRAS_API_KEY` (line 40). Update provider config:

```bash
# Provider for OpenCode serve
OPENCODE_PROVIDER_ID=cerebras
OPENCODE_PROVIDER_API_KEY=  # Use CEREBRAS_API_KEY value
```

### 3. Create Documentation

Add `opencode/agent/cerebras-setup.md` documenting Cerebras setup via OpenCode serve API.

### To-dos

- [ ] Create .opencode directory structure
- [ ] Create .opencode/opencode.jsonc with GLM 4.6 as default model
- [ ] Update .env.example with OpenCode Zen provider variables
- [ ] Create opencode/agent/glm-setup.md with API documentation