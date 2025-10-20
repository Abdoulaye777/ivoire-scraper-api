#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Starting build script for scraper service..."

# Installe les dépendances système nécessaires pour Playwright AVANT npm install
# C'est la meilleure tentative pour préparer l'environnement
echo "Installing Playwright system dependencies..."
npx playwright install-deps

# Installe les dépendances npm
echo "Installing npm dependencies..."
npm install

# Installe le navigateur Chromium (devrait être géré par npm install, mais on s'assure qu'il est là)
echo "Installing Playwright browser..."
npx playwright install chromium

echo "Build script finished successfully."
