#!/usr/bin/env bash
# exit on error
set -o errexit

# Installe les dépendances npm
npm install

# Installe le navigateur Chromium pour Playwright.
# Nous n'utilisons pas --with-deps car l'environnement de build de Render
# fournit déjà les dépendances système nécessaires.
npx playwright install chromium
