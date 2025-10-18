
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/**
 * Scrape le contenu HTML d'une URL donnée en utilisant Playwright.
 * @param {string} url L'URL de la page à scraper.
 * @returns {Promise<object>} Un objet contenant le HTML de la page ou un objet d'erreur.
 */
async function fetchPageContent(url) {
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
        
        const content = await page.content();
        
        console.log('[Scraper] ✅ Contenu HTML brut extrait.');
        
        return { content };

    } catch (error) {
        console.error(`[Scraper] ERREUR lors de la récupération du contenu de ${url}:`, error.message);
        return { error: `La récupération du contenu de la page a échoué: ${error.message}` };
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
        console.log(`[API] Début de la récupération de contenu pour l'URL: ${url}`);
        const result = await fetchPageContent(url);
        
        if (result.error) {
            console.error(`[API] Erreur rapportée par le scraper: ${result.error}`);
            return res.status(500).json({ success: false, message: result.error });
        }
        
        // Validation que le contenu existe
        if (!result.content) {
             return res.status(500).json({ success: false, message: "Le contenu de la page est vide." });
        }

        console.log('[API] ✅ Récupération de contenu réussie, envoi de la réponse JSON.');
        return res.status(200).json({ success: true, content: result.content });

    } catch (error) {
        console.error(`[API] Erreur critique du serveur pour l'URL ${url}:`, error);
        return res.status(500).json({ 
            success: false, 
            message: error instanceof Error ? `Erreur du serveur : ${error.message}` : 'Une erreur serveur inconnue est survenue.'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur de scraping en écoute sur le port ${PORT}`);
});
