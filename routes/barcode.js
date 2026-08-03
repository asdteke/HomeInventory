import express from 'express';
import axios from 'axios';
// Lazy-load cheerio to avoid ESM resolution crash on Node v25+
let cheerio = null;
async function getCheerio() {
    if (!cheerio) {
        try {
            cheerio = await import('cheerio');
        } catch (e) {
            console.error('[Barcode] cheerio yüklenemedi:', e.message);
            return null;
        }
    }
    return cheerio;
}
import db from '../database.js';
import { authenticateToken, requireActiveHouse } from '../middleware/auth.js';
import { buildBarcodeLookup, decryptItemRecord } from '../utils/protectedFields.js';

const router = express.Router();
const PRODUCT_LOOKUP_TIMEOUT_MS = 3500;

// Accept printable barcode payloads plus the GS1 group separator. Route callers
// URL-encode the value, and the length bound prevents oversized lookup requests.
const BARCODE_REGEX = /^(?:[^\u0000-\u001C\u001E-\u001F\u007F]|\u001D){1,120}$/u;

const selectVisibleBoxPlacement = db.prepare(`
    SELECT id
    FROM boxes
    WHERE id = ?
      AND house_key = ?
      AND (is_public = 1 OR created_by = ?)
    LIMIT 1
`);

const selectVisibleLocationPlacement = db.prepare(`
    SELECT id
    FROM locations
    WHERE id = ?
      AND house_key = ?
      AND (is_public = 1 OR created_by = ?)
    LIMIT 1
`);

function serializeLocalItem(item, viewerUserId) {
    const decryptedItem = decryptItemRecord(item);
    const privateBoxHidden = Boolean(
        decryptedItem.box_id &&
        !selectVisibleBoxPlacement.get(
            decryptedItem.box_id,
            decryptedItem.house_key,
            viewerUserId
        )
    );
    const privateLocationHidden = Boolean(
        decryptedItem.location_id &&
        !selectVisibleLocationPlacement.get(
            decryptedItem.location_id,
            decryptedItem.house_key,
            viewerUserId
        )
    );

    if (!privateBoxHidden && !privateLocationHidden) {
        return {
            ...decryptedItem,
            private_placement: false
        };
    }

    return {
        ...decryptedItem,
        box_id: privateBoxHidden ? null : decryptedItem.box_id,
        room_id: null,
        location_id: null,
        private_placement: true
    };
}

// Google scraper function - ürün adı almak için son çare olarak kullanılır
async function scrapeGoogle(barcode) {
    try {
        // encodeURIComponent: barkod değeri URL'e güvenli şekilde ekleniyor
        const response = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(barcode)}+ürün`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            timeout: 5000
        });

        const ch = await getCheerio();
        if (!ch) return null;
        const $ = ch.load(response.data);

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
async function tryOpenFoodFacts(barcode, signal) {
    try {
        const response = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`, {
            timeout: PRODUCT_LOOKUP_TIMEOUT_MS,
            signal
        });
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
async function tryOpenProductsFacts(barcode, signal) {
    try {
        const response = await axios.get(`https://world.openproductsfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`, {
            timeout: PRODUCT_LOOKUP_TIMEOUT_MS,
            signal
        });
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
async function tryOpenBeautyFacts(barcode, signal) {
    try {
        const response = await axios.get(`https://world.openbeautyfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`, {
            timeout: PRODUCT_LOOKUP_TIMEOUT_MS,
            signal
        });
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
router.get('/:code', authenticateToken, requireActiveHouse, async (req, res) => {
    const barcode = req.params.code;

    // Barkod format doğrulaması: sadece standart karakter setine izin ver
    if (!BARCODE_REGEX.test(barcode)) {
        return res.status(400).json({ error: 'Geçersiz barkod formatı' });
    }

    try {
        // STEP 1: Check local database
        const localItem = db.prepare(`
            SELECT *
            FROM items
            WHERE barcode_lookup = ?
              AND house_key = ?
              AND (is_public = 1 OR user_id = ?)
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
        `).get(buildBarcodeLookup(barcode), req.user.house_key, req.user.id);

        if (localItem) {
            const decryptedLocalItem = serializeLocalItem(localItem, req.user.id);
            return res.json({
                found: true,
                source: 'Yerel Veritabanı',
                name: decryptedLocalItem.name,
                existingItem: decryptedLocalItem
            });
        }

        // External catalogues receive the scanned barcode, so they are never
        // contacted implicitly. The client must request an online lookup
        // after the user explicitly chooses it.
        if (req.query.online !== '1') {
            return res.json({
                found: false,
                onlineLookupAvailable: true
            });
        }

        // STEP 2: Query the public catalogues concurrently and use the first
        // actual match. Cancel slower requests once one source succeeds.
        const lookupController = new AbortController();
        const lookupTasks = [tryOpenFoodFacts, tryOpenProductsFacts, tryOpenBeautyFacts]
            .map(async (lookup) => {
                const result = await lookup(barcode, lookupController.signal);
                if (!result) throw new Error('catalogue-miss');
                return result;
            });

        try {
            const catalogueResult = await Promise.any(lookupTasks);
            lookupController.abort();
            return res.json(catalogueResult);
        } catch {
            lookupController.abort();
        }

        // STEP 3: Try Google Scraping as last resort
        const googleName = await scrapeGoogle(barcode);
        if (googleName) {
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
        res.json({
            found: false,
            barcode: barcode,
            message: 'Ürün hiçbir veritabanında bulunamadı'
        });

    } catch (error) {
        console.error('[Barcode Proxy] Error:', error);
        res.status(500).json({ error: 'Barkod araması başarısız' });
    }
});

export default router;
