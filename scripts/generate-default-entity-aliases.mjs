import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PUBLIC_LOCALES_DIR = path.join(ROOT, 'client', 'public', 'locales');
const OUTPUT_FILE = path.join(ROOT, 'client', 'src', 'utils', 'defaultEntityAliases.js');

const ROOM_IDS = [
    'living_room',
    'bedroom',
    'kitchen',
    'bathroom',
    'office',
    'kids_room',
    'garage',
    'balcony',
    'storage'
];

const CATEGORY_IDS = [
    'kitchen',
    'electronics',
    'hobbies',
    'furniture',
    'clothing',
    'books',
    'tools',
    'sports',
    'other'
];

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeAlias(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

function getDeepValue(object, keyPath) {
    return keyPath.split('.').reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), object);
}

function collectAliasValues() {
    const roomAliases = new Map();
    const categoryAliases = new Map();

    if (!fs.existsSync(PUBLIC_LOCALES_DIR)) {
        return { roomAliases, categoryAliases };
    }

    const localeDirs = fs.readdirSync(PUBLIC_LOCALES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((lang) => fs.existsSync(path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json')));

    for (const lang of localeDirs) {
        const translation = readJson(path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json'));

        for (const roomId of ROOM_IDS) {
            const roomName = getDeepValue(translation, `rooms.defaults.${roomId}.name`);
            if (typeof roomName === 'string' && roomName.trim()) {
                roomAliases.set(normalizeAlias(roomName), roomId);
            }
        }

        for (const categoryId of CATEGORY_IDS) {
            const categoryName = getDeepValue(translation, `categories.defaults.${categoryId}`);
            if (typeof categoryName === 'string' && categoryName.trim()) {
                categoryAliases.set(normalizeAlias(categoryName), categoryId);
            }
        }
    }

    return { roomAliases, categoryAliases };
}

function toObjectLiteral(map) {
    const entries = [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([alias, id]) => `    ${JSON.stringify(alias)}: ${JSON.stringify(id)}`);

    return entries.length > 0
        ? `{\n${entries.join(',\n')}\n}`
        : '{}';
}

function main() {
    const { roomAliases, categoryAliases } = collectAliasValues();
    const output = `const ROOM_ALIAS_TO_ID = ${toObjectLiteral(roomAliases)};
const CATEGORY_ALIAS_TO_ID = ${toObjectLiteral(categoryAliases)};

function normalizeAliasText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/\\s+/g, ' ');
}

export { ROOM_ALIAS_TO_ID, CATEGORY_ALIAS_TO_ID, normalizeAliasText };
`;

    fs.writeFileSync(OUTPUT_FILE, output);
    console.log(`Generated ${path.relative(ROOT, OUTPUT_FILE)} with ${roomAliases.size} room aliases and ${categoryAliases.size} category aliases.`);
}

main();
