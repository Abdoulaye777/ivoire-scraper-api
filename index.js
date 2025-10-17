
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
 * Cette fonction attrape ses propres erreurs et retourne toujours un objet JS.
 * @param {string} url L'URL de la page produit à scraper.
 * @returns {Promise<object>} Un objet contenant les données du produit ou un objet d'erreur.
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
             // Retourne un objet d'erreur, ne lance pas d'exception
            return { error: "Le nom du produit n'a pas pu être extrait. Le sélecteur '.product-info .title' est peut-être obsolète." };
        }
        
        const productName = cleanText(productNameRaw);
        const price = cleanPriceNoDecimals(priceRaw);
        const descriptionComplete = cleanText(descriptionRaw);
        
        const scrapedData = {
            productName,
            price,
            descriptionComplete: descriptionComplete || 'Aucune description trouvée.',
            imageUrl: imageUrl || undefined,
            productUrl: url,
        };

        console.log(`[Playwright] ✅ Données extraites :`, scrapedData);
        return scrapedData;

    } catch (error) {
        console.error(`[Playwright] ERREUR critique lors du scraping de l'URL ${url}:`, error.message);
        // En cas d'erreur grave (navigation, etc.), retourne un objet d'erreur structuré.
        return { error: `Le scraping a échoué. Cause: ${error.message}` };
    } finally {
        if (browser) {
            await browser.close();
            console.log('[Playwright] Navigateur fermé.');
        }
    }
}

app.post('/scrape', async (req, res) => {
    const { url } = req.body;

    // Définir l'en-tête une seule fois au début
    res.setHeader('Content-Type', 'application/json');

    if (!url) {
        return res.status(400).json({ success: false, message: 'URL est requise.' });
    }

    try {
        console.log(`[API] Début du scraping pour l'URL: ${url}`);
        const scrapedResult = await scrapeWithPlaywright(url);
        
        // Si la fonction de scraping a retourné une erreur, on la traite comme un échec.
        if (scrapedResult.error) {
            console.error(`[API] Erreur rapportée par le scraper: ${scrapedResult.error}`);
            return res.status(500).json({ success: false, message: scrapedResult.error });
        }
        
        // Valider que la conversion en JSON est possible avant d'envoyer.
        // Bien que cela soit peu probable avec des objets simples, c'est une sécurité.
        try {
            JSON.stringify(scrapedResult);
        } catch (e) {
            throw new Error('Erreur lors de la conversion des données en JSON.');
        }

        console.log('[API] ✅ Scraping réussi, envoi de la réponse JSON.');
        return res.status(200).json({ success: true, data: scrapedResult });

    } catch (error) {
        // Ce bloc attrape les erreurs inattendues (ex: erreur de conversion JSON).
        console.error(`[API] Erreur finale du serveur pour l'URL ${url}:`, error.message);
        return res.status(500).json({ 
            success: false, 
            message: error.message || 'Une erreur inconnue est survenue durant le scraping.' 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur de scraping en écoute sur le port ${PORT}`);
});
