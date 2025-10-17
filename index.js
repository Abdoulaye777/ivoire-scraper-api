
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/**
 * Nettoie une chaîne de caractères représentant un prix pour en extraire un nombre entier.
 * @param {string | null} priceStr La chaîne de prix brute.
 * @returns {number | null} Le prix sous forme de nombre entier, ou null si invalide.
 */
function cleanPriceNoDecimals(priceStr) {
  if (!priceStr || priceStr.trim() === '') {
    return null;
  }
  const cleaned = priceStr.replace(/FCFA/gi, '').replace(/[^\d]/g, '');
  if (cleaned === '') {
    return null;
  }
  const priceNumber = parseInt(cleaned, 10);
  return isNaN(priceNumber) ? null : priceNumber;
}

/**
 * Nettoie une chaîne de texte en supprimant les retours à la ligne, les tabulations
 * et les espaces multiples pour garantir un JSON propre.
 * @param {string | null} text Le texte à nettoyer.
 * @returns {string} Le texte nettoyé.
 */
function cleanText(text) {
    if (!text) return '';
    return text.replace(/(\r\n|\n|\r|\t)/gm, " ").replace(/\s+/g, ' ').trim();
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
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });

        console.log('[Playwright] Attente du sélecteur de titre principal...');
        await page.waitForSelector('.product-info .title', { timeout: 20000 });
        console.log('[Playwright] Sélecteur trouvé. Extraction des informations...');
        
        const productNameRaw = await page.locator('.product-info .title').first().textContent().catch(() => null);
        const priceRaw = await page.locator('.product-info .price').first().textContent({ timeout: 10000 }).catch(() => null);
        const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content').catch(() => null);
        const descriptionRaw = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);

        if (!productNameRaw || !productNameRaw.trim()) {
            throw new Error("Le nom du produit n'a pas pu être extrait. Le sélecteur '.product-info .title' est peut-être obsolète.");
        }
        
        const productName = cleanText(productNameRaw);
        const price = cleanPriceNoDecimals(priceRaw);
        const descriptionComplete = cleanText(descriptionRaw);
        
        console.log(`[Playwright] ✅ Données extraites et nettoyées: Nom='${productName}', Prix='${price}'`);

        return {
            productName,
            price,
            descriptionComplete: descriptionComplete || 'Aucune description trouvée.',
            imageUrl: imageUrl || undefined,
            productUrl: url,
        };

    } catch (error) {
        console.error(`[Playwright] ERREUR lors du scraping de l'URL ${url}:`, error.message);
        // Remonte l'erreur pour qu'elle soit gérée par le handler de la route Express
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
        // Définit le Content-Type et renvoie une erreur JSON propre
        return res.status(400).json({ success: false, message: 'URL est requise.' });
    }

    try {
        console.log(`[API] Début du scraping pour l'URL: ${url}`);
        const scrapedData = await scrapeWithPlaywright(url);
        
        // Définit le Content-Type et renvoie les données avec succès
        return res.status(200).json({ success: true, data: scrapedData });

    } catch (error) {
        console.error(`[API] Erreur finale interceptée pour l'URL ${url}:`, error.message);
        
        // Définit le Content-Type et renvoie une erreur JSON structurée
        // C'est le bloc "catch-all" qui garantit une réponse JSON.
        return res.status(500).json({ 
            success: false, 
            message: error.message || 'Une erreur inconnue est survenue durant le scraping.' 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur de scraping en écoute sur le port ${PORT}`);
});
