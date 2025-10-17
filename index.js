
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/**
 * Nettoie une chaîne de caractères représentant un prix pour en extraire un nombre entier.
 * Supprime les symboles monétaires (FCFA), les espaces, et les caractères non numériques.
 * @param {string | null} priceStr La chaîne de prix brute.
 * @returns {number | null} Le prix sous forme de nombre entier, ou null si invalide.
 */
function cleanPriceNoDecimals(priceStr) {
  if (!priceStr || priceStr.trim() === '') {
    return null;
  }
  // Remplace "FCFA" et tout ce qui n'est pas un chiffre par une chaîne vide
  const cleaned = priceStr.replace(/FCFA/gi, '').replace(/[^\d]/g, '');
  if (cleaned === '') {
    return null;
  }
  const priceNumber = parseInt(cleaned, 10);
  return isNaN(priceNumber) ? null : priceNumber;
}

/**
 * Scrape les informations d'un produit depuis une URL donnée en utilisant Playwright.
 * @param {string} url L'URL de la page produit à scraper.
 * @returns {Promise<object>} Un objet contenant les données du produit scrapé.
 */
async function scrapeWithPlaywright(url) {
    console.log('[Playwright] Lancement du navigateur...');
    let browser = null;
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        });
        const page = await context.newPage();

        console.log(`[Playwright] Navigation vers: ${url}`);
        // Augmentation du timeout de navigation à 90 secondes pour les sites lents
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });

        console.log('[Playwright] Attente du sélecteur de titre principal...');
        // Étape clé : attendre que le contenu dynamique soit chargé en ciblant un élément stable.
        await page.waitForSelector('.product-info .title', { timeout: 20000 });
        console.log('[Playwright] Sélecteur trouvé. Extraction des informations...');
        
        // --- Extraction des données ---
        const productNameRaw = await page.locator('.product-info .title').first().textContent().catch(() => null);
        const priceRaw = await page.locator('.product-info .price').first().textContent({ timeout: 10000 }).catch(() => null);
        
        // Les métadonnées sont souvent plus rapides et fiables à obtenir
        const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content').catch(() => null);
        const description = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);

        if (!productNameRaw || !productNameRaw.trim()) {
            throw new Error(`Le nom du produit n'a pas pu être extrait. Le sélecteur '.product-info .title' est peut-être obsolète.`);
        }
        
        // --- Nettoyage des données ---
        const productName = productNameRaw.trim();
        const price = cleanPriceNoDecimals(priceRaw);
        
        console.log(`[Playwright] ✅ Données extraites: Nom='${productName}', Prix='${price}'`);

        return {
            productName,
            price,
            descriptionComplete: description || 'Aucune description trouvée.',
            imageUrl: imageUrl || undefined,
            productUrl: url,
        };

    } catch (error) {
        console.error(`[Playwright] ERREUR lors du scraping de l'URL ${url}:`, error.message);
        // Propager une erreur plus explicite pour qu'elle soit renvoyée en JSON
        throw new Error(`Le scraping a échoué. Cause: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
            console.log('[Playwright] Navigateur fermé.');
        }
    }
}

app.post('/scrape', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, message: 'URL est requise.' });
    }

    try {
        console.log(`[API] Début du scraping pour l'URL: ${url}`);
        const scrapedData = await scrapeWithPlaywright(url);
        res.status(200).json({ success: true, data: scrapedData });
    } catch (error) {
        console.error(`[API] Erreur finale interceptée pour l'URL ${url}:`, error.message);
        res.status(500).json({ success: false, message: error.message || 'Une erreur inconnue est survenue durant le scraping.' });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur de scraping en écoute sur le port ${PORT}`);
});
