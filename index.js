
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/**
 * Nettoie une chaîne de caractères représentant un prix pour en extraire un nombre.
 * @param {string | null} priceStr La chaîne de prix brute.
 * @returns {number | null} Le prix sous forme de nombre, ou null si invalide.
 */
function cleanPrice(priceStr) {
  if (!priceStr || typeof priceStr !== 'string') {
    return null;
  }
  const cleaned = priceStr.replace(/[^\d]/g, '');
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
    if (!text || typeof text !== 'string') return '';
    return text.replace(/(\r\n|\n|\r|\t)/gm, " ").replace(/\s+/g, ' ').trim();
}

/**
 * Scrape les informations d'un produit depuis une URL donnée en utilisant Playwright.
 * Cette fonction attrape ses propres erreurs et retourne toujours un objet JS.
 * @param {string} url L'URL de la page produit à scraper.
 * @returns {Promise<object>} Un objet contenant les données du produit ou un objet d'erreur.
 */
async function scrapeProduct(url) {
    let browser = null;
    console.log('[Scraper] Lancement du navigateur pour l\'URL :', url);
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        });
        const page = await context.newPage();

        console.log(`[Scraper] Navigation vers: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

        console.log('[Scraper] Attente des sélecteurs...');
        // Use a reliable selector that indicates the main content is loaded.
        await page.waitForSelector('.product-info .title', { timeout: 25000 });

        const productName = await page.locator('.product-info .title').first().textContent().catch(() => null);
        const price = await page.locator('.product-info .price').first().textContent().catch(() => null);
        const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content').catch(() => null);
        const description = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);
        
        console.log('[Scraper] ✅ Données brutes extraites.');
        
        return {
            productName: cleanText(productName),
            price: cleanPrice(price),
            descriptionComplete: cleanText(description) || 'Aucune description trouvée.',
            imageUrl: imageUrl || undefined,
            productUrl: url,
        };

    } catch (error) {
        console.error(`[Scraper] ERREUR lors du scraping de ${url}:`, error.message);
        // Retourne toujours un objet d'erreur JSON compatible
        return { error: `Le scraping a échoué: ${error.message}` };
    } finally {
        if (browser) {
            await browser.close();
            console.log('[Scraper] Navigateur fermé.');
        }
    }
}

app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    res.setHeader('Content-Type', 'application/json');

    if (!url) {
        return res.status(400).json({ success: false, message: 'URL est requise.' });
    }

    try {
        console.log(`[API] Début du scraping pour l'URL: ${url}`);
        const scrapedResult = await scrapeProduct(url);
        
        // Si le scraper lui-même a attrapé une erreur, il la renvoie dans l'objet.
        if (scrapedResult.error) {
            console.error(`[API] Erreur rapportée par le scraper: ${scrapedResult.error}`);
            return res.status(500).json({ success: false, message: scrapedResult.error });
        }
        
        // Validation finale que la réponse est un objet sérialisable
        JSON.stringify(scrapedResult);

        console.log('[API] ✅ Scraping réussi, envoi de la réponse JSON.');
        return res.status(200).json({ success: true, data: scrapedResult });

    } catch (error) {
        console.error(`[API] Erreur critique du serveur pour l'URL ${url}:`, error);
        // Ultime recours : envoyer une erreur JSON standard
        return res.status(500).json({ 
            success: false, 
            message: error instanceof Error ? `Erreur du serveur : ${error.message}` : 'Une erreur serveur inconnue est survenue.'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur de scraping en écoute sur le port ${PORT}`);
});
