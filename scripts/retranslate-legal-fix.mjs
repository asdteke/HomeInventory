import fs from 'fs';
import path from 'path';

const PUBLIC_LOCALES_DIR = 'client/public/locales';

const FALLBACK_LANGS = ["ceb", "co", "da", "eo", "fa", "fy", "gd", "gl", "haw", "hmn", "ht", "hy", "ig", "jv", "km", "kn", "ky", "la", "lb", "mn", "my", "ne", "ny", "or", "pa", "ps", "sd", "si", "sk", "sl", "sn", "so", "sq", "sr-Cyrl", "st", "sw", "ta", "te", "tg", "th", "uk", "ur", "uz", "vi", "yi", "yo", "zu"];

const VARIABLES = [
    '{{brandName}}',
    '{{controllerName}}',
    '{{controllerAddress}}',
    '{{privacyEmail}}',
    '{{supportEmail}}'
];

const TEMPLATE_PRIVACY_FALLBACK = `## Overview and Purpose\n**{{brandName}}** is an open-source, privacy-centric home inventory management system. This legal documentation is provided to ensure users are fully informed about data practices. For this specific deployment, the data controller and service provider is **{{controllerName}}**.\n\n### Data Controller Information:\n- **Registered Address:** {{controllerAddress}}\n- **Privacy Compliance Email:** {{privacyEmail}}\n- **General Support Services:** {{supportEmail}}\n\nThis comprehensive notice explains **what personal data is processed**, **how it is collected**, **why it is processed**, **who may receive it**, **how long it is securely stored**, and **what specific legal rights you have** regarding your information.\n\n## Detailed Data Collection and Processing\n- **Account Metadata:** This includes your chosen username, email address, cryptographically hashed passwords (we never store plain-text passwords), session cookies for secure authentication, trusted device identifiers, and detailed security logs to prevent unauthorized access.\n- **Application Service Data:** All information regarding houses, rooms, categories, inventory items, media files you upload, and all personal vault records you create within the platform.\n- **Technical Infrastructure Data:** This includes IP addresses (stored solely for security and rate-limiting purposes), browser fingerprints, session identifiers, and language preference data to ensure a consistent and localized user experience.\n\n## Purpose and Rationale for Processing\n- **Operational Necessity:** The primary reason for processing is to facilitate account creation, provide management features, and allow full access to the application's unique features.\n- **Security and Integrity:** To verify your identity during secure login procedures and to protect user sessions from malicious third-party activities.\n- **Core Product Features:** To deliver the essential inventory, cloud backup, and Personal Vault encryption functions that form the core of the {{brandName}} global experience.\n\n## Data Security, Retention, and User Rights\nWe implement rigorous technical and organizational measures to protect your data against loss, theft, or unauthorized access. All data is stored on secure infrastructure. You have the right to request access to your data, request corrections, or use the in-app account deletion flow to permanently erase your information. For any privacy inquiries, please contact the controller at the details provided above. Your global privacy and data sovereignty are our highest priorities.\n\n## Updates to this Policy\nWe reserve the right to update this Privacy Policy at any time. We will notify you of material changes within the application. Your continued use of the service constitutes acceptance of the revised terms.`;

const TEMPLATE_TERMS_FALLBACK = `1. **Acceptance of Terms:** By accessing and using the services provided by **{{brandName}}**, you expressly agree to be bound by these comprehensive terms and conditions of use.\n2. **Service Disclaimer:** The service is provided on an "as is" and "as available" basis, without any warranties of any kind, whether express, implied, or statutory, to the maximum extent permitted by applicable law.\n3. **User Responsibility:** You remain solely and fully responsible for the legality, accuracy, integrity, and ownership of all content that you upload, store, or share via the platform.\n4. **Security of Credentials:** It is your sole responsibility to maintain the confidentiality of your password, recovery keys, and backup materials in a safe and responsible manner.\n5. **Termination of Access:** We reserve the right to suspend, restrict, or delete accounts that violate these core policies or that may compromise the security and integrity of the system without prior notice.`;


async function translateChunk(text, targetLang) {
    if (!text.trim()) return text;
    
    // Replace variables with safe uppercase words to prevent translation issues
    let safeText = text;
    VARIABLES.forEach((v, i) => {
        safeText = safeText.split(v).join(` VAR${i} `);
    });

    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(safeText);
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        let translated = data[0].map(item => item[0]).join('');
        
        // Restore variables
        VARIABLES.forEach((v, i) => {
            const regex = new RegExp(`\\s*VAR${i}\\s*`, 'g');
            translated = translated.replace(regex, v);
        });
        
        return translated;
    } catch (e) {
        console.error(`Error translating to ${targetLang}:`, e.message);
        return text; // Fallback to original
    }
}

async function translateFullText(text, targetLang) {
    const chunks = text.split('\n\n');
    const translatedChunks = [];
    for (const chunk of chunks) {
        const lines = chunk.split('\n');
        const translatedLines = [];
        for (const line of lines) {
            if (!line.trim()) {
                translatedLines.push(line);
                continue;
            }
            const translatedLine = await translateChunk(line, targetLang);
            translatedLines.push(translatedLine);
        }
        translatedChunks.push(translatedLines.join('\n'));
    }
    return translatedChunks.join('\n\n');
}

async function main() {
    let count = 0;
    for (const lang of FALLBACK_LANGS) {
        let gLang = lang;
        if (gLang === 'sr-Cyrl') gLang = 'sr';
        if (gLang === 'zh-Hans') gLang = 'zh-CN';
        if (gLang === 'zh-Hant') gLang = 'zh-TW';

        const filePath = path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json');
        if (!fs.existsSync(filePath)) continue;

        console.log(`Translating ${lang}...`);
        
        const transPrivacy = await translateFullText(TEMPLATE_PRIVACY_FALLBACK, gLang);
        await new Promise(r => setTimeout(r, 1000));
        const transTerms = await translateFullText(TEMPLATE_TERMS_FALLBACK, gLang);
        
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        content.legal.privacy_policy_content = transPrivacy;
        content.legal.terms_of_service_content = transTerms;
        
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        console.log(`  - [OK] ${lang} translated.`);
        count++;
        await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`Total translated: ${count}`);
}

main();
