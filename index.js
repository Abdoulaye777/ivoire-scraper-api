
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Instructions pour l'IA
const promptTemplate = `
You are an expert web scraper and data extractor. Your task is to analyze the provided HTML content of a product page and extract the specified product information.

Carefully parse the following HTML content:
--- HTML START ---
{{{htmlContent}}}
--- HTML END ---

From the HTML, extract the following details and return them as a valid JSON object:
- productName: The main title or name of the product.
- price: The price of the product. Return it as a string of numbers only, without any currency symbols (like 'FCFA', '€', '$'), thousand separators (like ',', '.'), or any other non-numeric characters. For example, if the price is "150.000 FCFA", you should return "150000".
- currency: The currency of the price (e.g., "XOF", "EUR", "USD"). If you can't determine it, default to "XOF".
- descriptionComplete: A detailed product description.
- imageUrl: The absolute URL for the main product image. If the URL is relative (e.g., /path/to/image.jpg), you must not include it. Only absolute URLs are valid.
- productUrl: The original URL of the page. Use this exact value: {{{productUrl}}}

If you cannot find a specific piece of information, omit the corresponding field from the JSON output. If the content does not appear to be a product page, return a JSON object with an 'error' field explaining why.
The final output must be a single, valid JSON object and nothing else.
`;


async function extractProductDataWithAI(html, url) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("La variable d'environnement GEMINI_API_KEY n'est pas définie sur le serveur de scraping.");
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    // Nous utilisons un modèle réputé stable et largement disponible.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const fullPrompt = promptTemplate.replace('{{{htmlContent}}}', html).replace('{{{productUrl}}}', url);
    
    try {
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        let text = response.text();
        
        // Nettoyage pour s'assurer que la réponse est bien un JSON valide
        text = text.trim().replace(/^```json|```$/g, '').trim();

        const data = JSON.parse(text);
        
        if (data.error) {
            throw new Error(`L'IA a déterminé que ce n'est pas une page produit valide : ${data.error}`);
        }
        
        // S'assurer que les champs essentiels sont là
        if (!data.productName || !data.price) {
            throw new Error("L'IA n'a pas pu extraire le nom ou le prix du produit.");
        }

        return data;

    } catch (error) {
        console.error("[AI Extractor] Erreur lors de l'extraction par IA:", error);
        throw new Error(`L'extraction des données par l'IA a échoué : ${error.message}`);
    }
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
        // Augmentation du timeout pour les sites lents
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        const bodyHtml = await page.evaluate(() => document.body.innerHTML);
        
        if (!bodyHtml) {
            console.warn('[Scraper] AVERTISSEMENT: Le contenu de la page est vide après chargement.');
            return { error: 'Le contenu de la page récupérée est vide.' };
        }

        console.log('[Scraper] ✅ Contenu HTML brut extrait. Parsing avec l\'IA...');
        const productData = await extractProductDataWithAI(bodyHtml, url);

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
