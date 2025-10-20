#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Starting build script for scraper service..."

# Installe les dépendances npm
echo "Installing npm dependencies..."
npm install

# Installe le navigateur Chromium pour Playwright.
# --with-deps est supprimé car il nécessite des permissions sudo qui ne sont pas disponibles.
echo "Installing Playwright browser..."
npx playwright install chromium

echo "Build script finished successfully."
