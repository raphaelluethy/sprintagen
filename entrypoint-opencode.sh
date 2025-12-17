#!/bin/bash
set -e

MOUNT_DIR="/workspace/repo"
CLONE_DIR="/workspace/cloned_repo"

# Determine which repo to use:
# 1. If a volume is mounted with a .git directory, use that (takes priority)
# 2. If GIT_REPO_URL is set, clone to a separate writable directory
# 3. Otherwise, fail with helpful message
if [ -d "$MOUNT_DIR/.git" ]; then
    echo "Repository detected at $MOUNT_DIR (volume mount)"
    REPO_DIR="$MOUNT_DIR"
elif [ -n "$GIT_REPO_URL" ]; then
    # Clone to a separate directory (avoids read-only volume mount issues)
    if [ -d "$CLONE_DIR/.git" ]; then
        echo "Using previously cloned repository at $CLONE_DIR"
    else
        echo "Cloning repository from $GIT_REPO_URL..."
        rm -rf "$CLONE_DIR" 2>/dev/null || true
        git clone "$GIT_REPO_URL" "$CLONE_DIR"
        echo "Repository cloned successfully"
    fi
    REPO_DIR="$CLONE_DIR"

    # Security: Always remove repo's .opencode/ config to prevent prompt injection
    # OpenCode has no flag to disable custom tool loading, so we must delete them
    # This runs on every startup to catch any git pull updates too
    if [ -d "$CLONE_DIR/.opencode" ]; then
        echo "Removing repo's .opencode/ directory (security hardening)..."
        rm -rf "$CLONE_DIR/.opencode"
    fi
else
    echo "No repository found and GIT_REPO_URL not set"
    echo "Please either:"
    echo "  - Mount a repository to /workspace/repo"
    echo "  - Set GIT_REPO_URL environment variable"
    exit 1
fi

cd "$REPO_DIR"

echo ""
echo "==========================================="
echo "  Starting Opencode server on port 4096"
echo "==========================================="
echo ""

# Run opencode server with security hardening:
# - OPENCODE_CONFIG: Use only our trusted global config (ignores repo's .opencode/)
# - OPENCODE_DISABLE_DEFAULT_PLUGINS: Prevent loading any plugins from repo
# This prevents prompt injection from untrusted repositories.
export OPENCODE_CONFIG="/root/.config/opencode/opencode.jsonc"
export OPENCODE_DISABLE_DEFAULT_PLUGINS=true

exec opencode serve --hostname 0.0.0.0 --port 4096
