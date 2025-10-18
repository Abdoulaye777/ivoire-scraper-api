
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
// Render fournit le port via la variable d'environnement PORT
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

/**
 * Scrape le contenu HTML d'une URL donnée en utilisant Playwright.
 * @param {string} url L'URL de la page à scraper.
 * @returns {Promise<object>} Un objet contenant le HTML de la page ou un objet d'erreur.
 */
async function fetchPageContent(url) {
    let browser;
    console.log('[Scraper] Lancement du navigateur pour l\'URL :', url);
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    } catch (launchError) {
        console.error('[Scraper] ERREUR CRITIQUE au lancement de Playwright:', launchError);
        return { error: 'Impossible de démarrer le navigateur pour le scraping. Contactez le support.' };
    }

    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        });
        const page = await context.newPage();

        console.log(`[Scraper] Navigation vers: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        
        const content = await page.content();
        
        if (!content) {
            console.warn('[Scraper] AVERTISSEMENT: Le contenu de la page est vide après chargement.');
            return { error: 'Le contenu de la page récupérée est vide.' };
        }

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
        console.error('[API] Requête reçue sans URL.');
        return res.status(400).json({ success: false, message: 'URL est requise.' });
    }

    try {
        console.log(`[API] Début de la récupération de contenu pour l'URL: ${url}`);
        const result = await fetchPageContent(url);
        
        if (result.error) {
            console.error(`[API] Erreur rapportée par le scraper: ${result.error}`);
            // Renvoyer une erreur 500 si le scraping lui-même a échoué
            return res.status(500).json({ success: false, message: result.error });
        }
        
        // Validation que le contenu existe
        if (!result.content) {
             console.error('[API] Erreur: Le scraper n\'a retourné aucun contenu.');
             return res.status(500).json({ success: false, message: "Le contenu de la page est vide." });
        }

        console.log('[API] ✅ Récupération de contenu réussie, envoi de la réponse JSON.');
        // Envoi d'une réponse de succès avec le contenu
        return res.status(200).json({ success: true, content: result.content });

    } catch (error) {
        console.error(`[API] Erreur critique du serveur pour l'URL ${url}:`, error);
        // Erreur finale pour les cas non gérés
        return res.status(500).json({ 
            success: false, 
            message: error instanceof Error ? `Erreur du serveur : ${error.message}` : 'Une erreur serveur inconnue est survenue.'
        });
    }
});

// Route "health check" pour vérifier que le serveur est en ligne
app.get('/', (req, res) => {
    res.status(200).send('Service de scraping en marche.');
});

app.listen(PORT, () => {
    console.log(`Serveur de scraping en écoute sur le port ${PORT}`);
});
