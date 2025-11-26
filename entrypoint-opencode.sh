#!/bin/bash
set -e

REPO_DIR="/workspace/repo"

# Check if repo already exists (volume mount case)
if [ -d "$REPO_DIR/.git" ]; then
    echo "Repository already exists at $REPO_DIR (volume mount detected)"
elif [ -n "$GIT_REPO_URL" ]; then
    echo "Cloning repository from $GIT_REPO_URL..."
    git clone "$GIT_REPO_URL" "$REPO_DIR"
    echo "Repository cloned successfully"
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

# Run opencode server in foreground
exec opencode serve --hostname 0.0.0.0 --port 4096
