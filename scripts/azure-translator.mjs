import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const AZURE_KEY = process.env.AZURE_TRANSLATOR_KEY;
const AZURE_REGION = process.env.AZURE_TRANSLATOR_REGION || 'westeurope';
const ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0';

/**
 * Translates an array of strings to a target language using Azure Translator.
 * @param {string[]} texts - Array of strings to translate.
 * @param {string} targetLang - Target language code (e.g., 'tr', 'fr').
 * @param {string} sourceLang - Source language code (default 'en').
 * @returns {Promise<string[]>} - Array of translated strings.
 */
export async function translateWithAzure(texts, targetLang, sourceLang = 'en') {
    if (!AZURE_KEY) {
        throw new Error('AZURE_TRANSLATOR_KEY is not set in .env');
    }

    if (!texts || texts.length === 0) return [];

    try {
        const response = await axios({
            baseURL: ENDPOINT,
            url: '',
            method: 'post',
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_KEY,
                'Ocp-Apim-Subscription-Region': AZURE_REGION,
                'Content-Type': 'application/json',
            },
            params: {
                'to': targetLang,
                'from': sourceLang,
                'textType': 'html' // Use HTML to preserve tags and variables better
            },
            data: texts.map(text => ({ 'Text': text })),
            responseType: 'json'
        });

        return response.data.map(item => item.translations[0].text);
    } catch (error) {
        console.error('Azure Translation Error:', error.response?.data || error.message);
        throw error;
    }
}
