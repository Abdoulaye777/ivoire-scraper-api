#!/usr/bin/env bash
# exit on error
set -o errexit

# Installe les dépendances npm
npm install

# Installe Playwright et ses dépendances de navigateur.
# L'argument --with-deps installe les dépendances système nécessaires.
npx playwright install --with-deps chromium
