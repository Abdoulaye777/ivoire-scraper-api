#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Starting build script for scraper service..."

# Install npm dependencies
echo "Installing npm dependencies..."
npm install

# Install only the Playwright browser.
# We skip installing system dependencies with `install-deps` as it requires sudo,
# which is not available in the Render build environment.
# The standard Render environment should have most of the necessary system libraries.
echo "Installing Playwright browser..."
npx playwright install chromium

echo "Build script finished successfully."
