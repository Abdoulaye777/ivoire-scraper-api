
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

async function fetchHtmlContent(url) {
    let browser;
    console.log('[Scraper] Lancement du navigateur pour l\'URL :', url);
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            // Bloquer les ressources inutiles pour accélérer le chargement
            route: (route) => {
                const resourceType = route.request().resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    route.abort();
                } else {
                    route.continue();
                }
            },
        });
        const page = await context.newPage();

        console.log(`[Scraper] Navigation vers: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

        // Attendre un sélecteur de base pour s'assurer que la page est chargée
        await page.waitForSelector('body', { timeout: 15000 });
        
        const bodyHtml = await page.content();
        
        if (!bodyHtml || bodyHtml.length < 500) { // Vérifier si le HTML n'est pas trop petit
            console.warn('[Scraper] AVERTISSEMENT: Le contenu de la page est vide ou trop petit.');
            throw new Error('Le contenu de la page récupérée est vide ou insuffisant.');
        }

        console.log('[Scraper] ✅ Contenu HTML brut extrait avec succès.');
        return bodyHtml;

    } catch (error) {
        console.error(`[Scraper] ERREUR lors de la récupération de ${url}:`, error.message);
        throw new Error(`La récupération du contenu a échoué: ${error.message}`);
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

    try {
        console.log(`[API] Début de la récupération du HTML pour l'URL: ${url}`);
        const htmlContent = await fetchHtmlContent(url);
        
        console.log('[API] ✅ Récupération HTML réussie, envoi de la réponse JSON.');
        return res.status(200).json({ success: true, html: htmlContent });

    } catch (error) {
        console.error(`[API] Erreur critique du serveur pour l'URL ${url}:`, error);
        return res.status(500).json({ 
            success: false, 
            message: error instanceof Error ? `Erreur du serveur de scraping : ${error.message}` : 'Une erreur serveur inconnue est survenue.'
        });
    }
});

app.get('/', (req, res) => {
    res.status(200).send('Service de scraping HTML en marche.');
});

app.listen(PORT, () => {
    console.log(`Serveur de scraping en écoute sur le port ${PORT}`);
});
