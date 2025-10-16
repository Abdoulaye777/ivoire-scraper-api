#!/usr/bin/env bash
# exit on error
set -o errexit

# Installe les dépendances système nécessaires pour Playwright
apt-get update && apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libgbm1

# Lance l'installation de npm, qui déclenchera le script postinstall
npm install
