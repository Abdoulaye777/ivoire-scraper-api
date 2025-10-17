
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function cleanPriceNoDecimals(priceStr) {
  if (!priceStr || priceStr.trim() === '') {
    return null;
  }
  const cleaned = priceStr.replace(/[^\d]/g, '');
  if (cleaned === '') {
    return null;
  }
  const priceNumber = parseInt(cleaned, 10);
  return isNaN(priceNumber) ? null : priceNumber;
}

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
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        console.log(`[Playwright] Extraction des informations...`);
        
        // Attendre le sélecteur de titre spécifique à babiken.net
        await page.waitForSelector('.product-info .title', { timeout: 15000 });

        const productNameRaw = await page.locator('.product-info .title').first().textContent().catch(() => null);
        const priceRaw = await page.locator('.product-info .price').first().textContent({ timeout: 10000 }).catch(() => null);
        const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content').catch(() => null);
        const description = await page.locator('meta[name="description"]').getAttribute('content').catch(() => null);

        if (!productNameRaw || !productNameRaw.trim()) {
            throw new Error(`Le nom du produit n'a pas pu être extrait. Les sélecteurs CSS sont peut-être obsolètes.`);
        }
        
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
        const scrapedData = await scrapeWithPlaywright(url);
        res.status(200).json({ success: true, data: scrapedData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Une erreur inconnue est survenue durant le scraping.' });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur de scraping en écoute sur le port ${PORT}`);
});
