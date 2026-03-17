import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Google scraper function - extracts product name from search results
async function scrapeGoogle(barcode) {
    try {
        const response = await axios.get(`https://www.google.com/search?q=${barcode}+ürün`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            timeout: 5000
        });

        const $ = cheerio.load(response.data);

        // Try to get the first search result title
        let productName = null;

        // Method 1: h3 tags (search result titles)
        $('h3').each((i, el) => {
            if (!productName && i < 3) {
                const text = $(el).text().trim();
                // Filter out generic titles
                if (text && text.length > 3 && !text.toLowerCase().includes('google') &&
                    !text.toLowerCase().includes('search') && !text.toLowerCase().includes('ara')) {
                    productName = text;
                    return false; // break
                }
            }
        });

        // Method 2: Try product knowledge panel
        if (!productName) {
            const kgTitle = $('[data-attrid="title"]').text().trim();
            if (kgTitle) productName = kgTitle;
        }

        // Method 3: Check for shopping results
        if (!productName) {
            $('.sh-dgr__content').first().find('.Xjkr3b').each((i, el) => {
                if (!productName) {
                    productName = $(el).text().trim();
                }
            });
        }

        // Clean up the product name
        if (productName) {
            // Remove common suffixes
            productName = productName
                .replace(/\s*-\s*(Trendyol|Hepsiburada|Amazon|N11|GittiGidiyor|A101|BIM|ŞOK|Migros).*$/i, '')
                .replace(/\s*\|\s*.*$/, '')
                .trim();

            // Truncate if too long
            if (productName.length > 100) {
                productName = productName.substring(0, 100) + '...';
            }
        }

        return productName;
    } catch (error) {
        console.error('Google scrape error:', error.message);
        return null;
    }
}

// Try Open Food Facts API
async function tryOpenFoodFacts(barcode) {
    try {
        const response = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`, { timeout: 5000 });
        if (response.data.status === 1 && response.data.product) {
            const p = response.data.product;
            return {
                found: true,
                source: 'Open Food Facts',
                name: p.product_name || p.product_name_tr || p.generic_name,
                brand: p.brands,
                image: p.image_url || p.image_front_url,
                category: 'Gıda'
            };
        }
    } catch (e) { }
    return null;
}

// Try Open Products Facts API
async function tryOpenProductsFacts(barcode) {
    try {
        const response = await axios.get(`https://world.openproductsfacts.org/api/v0/product/${barcode}.json`, { timeout: 5000 });
        if (response.data.status === 1 && response.data.product) {
            const p = response.data.product;
            return {
                found: true,
                source: 'Open Products Facts',
                name: p.product_name || p.generic_name,
                brand: p.brands,
                image: p.image_url || p.image_front_url,
                category: 'Genel Ürün'
            };
        }
    } catch (e) { }
    return null;
}

// Try Open Beauty Facts API
async function tryOpenBeautyFacts(barcode) {
    try {
        const response = await axios.get(`https://world.openbeautyfacts.org/api/v0/product/${barcode}.json`, { timeout: 5000 });
        if (response.data.status === 1 && response.data.product) {
            const p = response.data.product;
            return {
                found: true,
                source: 'Open Beauty Facts',
                name: p.product_name || p.generic_name,
                brand: p.brands,
                image: p.image_url || p.image_front_url,
                category: 'Kozmetik'
            };
        }
    } catch (e) { }
    return null;
}

// Main barcode lookup endpoint - Waterfall API
router.get('/:code', authenticateToken, async (req, res) => {
    const barcode = req.params.code;
    console.log(`[Barcode Proxy] Searching for: ${barcode}`);

    try {
        // STEP 1: Check local database
        const localItem = db.prepare(`
            SELECT * FROM items WHERE barcode = ? AND (user_id = ? OR is_public = 1)
        `).get(barcode, req.user.id);

        if (localItem) {
            console.log(`[Barcode Proxy] Found in local DB: ${localItem.name}`);
            return res.json({
                found: true,
                source: 'Yerel Veritabanı',
                name: localItem.name,
                existingItem: localItem
            });
        }

        // STEP 2: Try Open Food Facts
        console.log('[Barcode Proxy] Trying Open Food Facts...');
        const foodResult = await tryOpenFoodFacts(barcode);
        if (foodResult) {
            console.log(`[Barcode Proxy] Found in Open Food Facts: ${foodResult.name}`);
            return res.json(foodResult);
        }

        // STEP 3: Try Open Products Facts
        console.log('[Barcode Proxy] Trying Open Products Facts...');
        const productResult = await tryOpenProductsFacts(barcode);
        if (productResult) {
            console.log(`[Barcode Proxy] Found in Open Products Facts: ${productResult.name}`);
            return res.json(productResult);
        }

        // STEP 4: Try Open Beauty Facts
        console.log('[Barcode Proxy] Trying Open Beauty Facts...');
        const beautyResult = await tryOpenBeautyFacts(barcode);
        if (beautyResult) {
            console.log(`[Barcode Proxy] Found in Open Beauty Facts: ${beautyResult.name}`);
            return res.json(beautyResult);
        }

        // STEP 5: Try Google Scraping as last resort
        console.log('[Barcode Proxy] Trying Google Scraping...');
        const googleName = await scrapeGoogle(barcode);
        if (googleName) {
            console.log(`[Barcode Proxy] Found via Google: ${googleName}`);
            return res.json({
                found: true,
                source: 'Google Arama',
                name: googleName,
                brand: null,
                image: null,
                category: null,
                isGoogleResult: true
            });
        }

        // Not found anywhere
        console.log('[Barcode Proxy] Product not found in any source');
        res.json({
            found: false,
            barcode: barcode,
            message: 'Ürün hiçbir veritabanında bulunamadı'
        });

    } catch (error) {
        console.error('[Barcode Proxy] Error:', error);
        res.status(500).json({ error: 'Barkod araması başarısız', details: error.message });
    }
});

export default router;
