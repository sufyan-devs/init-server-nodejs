#!/bin/bash
set -e

APP_DIR="$(pwd)"
PM2_APP_NAME="ba-cpn-server"

echo "🚀 Starting production deployment in $APP_DIR..."

# 1. Ensure git is installed
if ! command -v git &> /dev/null; then
    echo "📦 git not found. Installing git..."
    sudo apt update
    sudo apt install -y git
    echo "✅ git installed successfully."
else
    echo "✅ git is already installed."
fi

# 2. Check if this is a git repository
if [ ! -d ".git" ]; then
    echo "❌ This directory is not a git repository. Please clone your repo first."
    exit 1
fi

# 3. Pull latest code
echo "📦 Pulling latest code from git..."
git pull origin main || { echo "❌ git pull failed"; exit 1; }

# 4. Install dependencies
if [ ! -f "package-lock.json" ]; then
    echo "⚠️  package-lock.json not found. Run 'npm install' locally and commit it."
    exit 1
fi
echo "📦 Installing dependencies with npm ci..."
npm ci

# 5. Build TypeScript
echo "🔨 Building TypeScript..."
npm run build || { echo "❌ Build failed"; exit 1; }

# 6. Prune devDependencies after build
echo "🧹 Pruning devDependencies..."
npm prune --omit=dev

# 7. Restart PM2
echo "🔄 Restarting PM2 application..."
pm2 reload $PM2_APP_NAME --update-env || { echo "❌ PM2 reload failed"; exit 1; }

# 8. Cleanup and status
npm cache clean --force
pm2 status

echo "✅ Deployment completed successfully!"
