#!/bin/bash

# Script to install dependencies, build, and deploy the plugin to a Steam Deck
# Usage: ./scripts/deploy/full-deploy.sh <HOST>

set -e

HOST="$1"

if [ -z "$HOST" ]; then
    echo "Error: HOST parameter is required"
    echo "Usage: $0 <HOST>"
    exit 1
fi

echo "Installing dependencies..."
pnpm install

echo "Building plugin..."
pnpm run build

echo "Deploying to $HOST..."
pnpm run deploy:deck:hard "$HOST"

echo "Deployment completed successfully!"