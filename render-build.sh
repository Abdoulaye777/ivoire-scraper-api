#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Starting build script for scraper service..."

# Install npm dependencies
echo "Installing npm dependencies..."
npm install

# Install Playwright browsers and all system dependencies.
# The --with-deps flag ensures all necessary libraries are installed,
# which is crucial for CI/CD environments like Render.
echo "Installing Playwright and its dependencies..."
npx playwright install --with-deps chromium

echo "Build script finished successfully."
