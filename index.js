
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Sélecteurs pour Jumia.ci - C'est ici que vous devrez adapter si le site change
const JUMIA_SELECTORS = {
    name: 'h1.-pbxs',
    price: '.-b.-ltr.-tal.-fs24',
    description: 'div.markup.-mhm > p',
    image: 'img.-fw.-fh',
    currency: 'span[data-currency-iso]',
};

function extractJumiaProductData(html, url) {
    const $ = cheerio.load(html);

    const productName = $(JUMIA_SELECTORS.name).first().text().trim();
    
    // Le prix est souvent dans un format comme "150,000 FCFA". Nous extrayons seulement les chiffres.
    const priceString = $(JUMIA_SELECTORS.price).first().text().trim();
    const price = priceString.replace(/[^\d]/g, '');

    const descriptionComplete = $(JUMIA_SELECTORS.description).text().trim();
    
    let imageUrl = $(JUMIA_SELECTORS.image).first().attr('data-src');
    if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = new URL(imageUrl, url).href;
    }

    const currency = "XOF";

    if (!productName || !price) {
        console.warn('[Cheerio] Avertissement: Le nom ou le prix du produit n\'a pas été trouvé. La page n\'est peut-être pas une page produit.');
        return null; // Retourne null si les données essentielles ne sont pas trouvées
    }

    return {
        productName,
        price,
        currency,
        descriptionComplete,
        imageUrl,
        productUrl: url,
    };
}


async function fetchAndParse(url) {
    let browser;
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
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        
        // Attendre que le sélecteur de nom de produit soit visible, signe que la page est chargée côté client
        await page.waitForSelector(JUMIA_SELECTORS.name, { timeout: 15000 });

        const content = await page.content();
        
        if (!content) {
            console.warn('[Scraper] AVERTISSEMENT: Le contenu de la page est vide après chargement.');
            return { error: 'Le contenu de la page récupérée est vide.' };
        }

        console.log('[Scraper] ✅ Contenu HTML brut extrait. Parsing avec Cheerio...');
        const productData = extractJumiaProductData(content, url);

        if (!productData) {
            return { error: 'Impossible d\'extraire les données du produit. Vérifiez que l\'URL pointe vers une page produit valide.' };
        }

        return { data: productData };

    } catch (error) {
        console.error(`[Scraper] ERREUR lors de la récupération ou du parsing de ${url}:`, error.message);
        return { error: `La récupération ou le parsing du contenu a échoué: ${error.message}` };
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
        console.error('[API] Requête reçue sans URL.');
        return res.status(400).json({ success: false, message: 'URL est requise.' });
    }

    // Pour l'instant, on ne gère que Jumia. On pourrait ajouter d'autres sites ici.
    if (!url.includes('jumia.ci')) {
        return res.status(400).json({ success: false, message: 'Pour le moment, seul le scraping de jumia.ci est supporté.' });
    }

    try {
        console.log(`[API] Début du scraping pour l'URL: ${url}`);
        const result = await fetchAndParse(url);
        
        if (result.error) {
            console.error(`[API] Erreur rapportée par le scraper: ${result.error}`);
            return res.status(500).json({ success: false, message: result.error });
        }
        
        console.log('[API] ✅ Scraping réussi, envoi de la réponse JSON.');
        return res.status(200).json({ success: true, data: result.data });

    } catch (error) {
        console.error(`[API] Erreur critique du serveur pour l'URL ${url}:`, error);
        return res.status(500).json({ 
            success: false, 
            message: error instanceof Error ? `Erreur du serveur : ${error.message}` : 'Une erreur serveur inconnue est survenue.'
        });
    }
});

app.get('/', (req, res) => {
    res.status(200).send('Service de scraping en marche.');
});

app.listen(PORT, () => {
    console.log(`Serveur de scraping en écoute sur le port ${PORT}`);
});
