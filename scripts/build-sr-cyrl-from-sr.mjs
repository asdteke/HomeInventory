import fs from 'fs';
import path from 'path';

const PUBLIC_ROOT = path.join(process.cwd(), 'client', 'public', 'locales');
const SRC_ROOT = path.join(process.cwd(), 'client', 'src', 'locales');
const SOURCE_LANG = 'sr';
const TARGET_LANG = 'sr-Cyrl';
const FILE_NAME = 'translation.json';
const PRESERVE_TOKENS = ['HomeInventory', 'Google', 'JSON', 'QR Code', 'IndexNow', 'Resend'];

const DIGRAPHS = [
    ['DŽ', 'Џ'],
    ['Dž', 'Џ'],
    ['dž', 'џ'],
    ['LJ', 'Љ'],
    ['Lj', 'Љ'],
    ['lj', 'љ'],
    ['NJ', 'Њ'],
    ['Nj', 'Њ'],
    ['nj', 'њ']
];

const LETTERS = new Map([
    ['A', 'А'],
    ['B', 'Б'],
    ['C', 'Ц'],
    ['Č', 'Ч'],
    ['Ć', 'Ћ'],
    ['D', 'Д'],
    ['Đ', 'Ђ'],
    ['E', 'Е'],
    ['F', 'Ф'],
    ['G', 'Г'],
    ['H', 'Х'],
    ['I', 'И'],
    ['J', 'Ј'],
    ['K', 'К'],
    ['L', 'Л'],
    ['M', 'М'],
    ['N', 'Н'],
    ['O', 'О'],
    ['P', 'П'],
    ['R', 'Р'],
    ['S', 'С'],
    ['Š', 'Ш'],
    ['T', 'Т'],
    ['U', 'У'],
    ['V', 'В'],
    ['Z', 'З'],
    ['Ž', 'Ж'],
    ['a', 'а'],
    ['b', 'б'],
    ['c', 'ц'],
    ['č', 'ч'],
    ['ć', 'ћ'],
    ['d', 'д'],
    ['đ', 'ђ'],
    ['e', 'е'],
    ['f', 'ф'],
    ['g', 'г'],
    ['h', 'х'],
    ['i', 'и'],
    ['j', 'ј'],
    ['k', 'к'],
    ['l', 'л'],
    ['m', 'м'],
    ['n', 'н'],
    ['o', 'о'],
    ['p', 'п'],
    ['r', 'р'],
    ['s', 'с'],
    ['š', 'ш'],
    ['t', 'т'],
    ['u', 'у'],
    ['v', 'в'],
    ['z', 'з'],
    ['ž', 'ж']
]);

function transliterateLatinToCyrillic(input) {
    const tokens = [];
    let text = String(input);

    for (let index = 0; index < PRESERVE_TOKENS.length; index += 1) {
        const token = PRESERVE_TOKENS[index];
        const marker = `__KEEP_${index}__`;
        tokens.push([marker, token]);
        text = text.split(token).join(marker);
    }

    text = text.replace(/\{\{[^}]+\}\}/g, (match) => {
        const marker = `__VAR_${tokens.length}__`;
        tokens.push([marker, match]);
        return marker;
    });

    for (const [latin, cyrillic] of DIGRAPHS) {
        text = text.split(latin).join(cyrillic);
    }

    text = Array.from(text).map((char) => LETTERS.get(char) || char).join('');

    for (const [marker, original] of tokens.reverse()) {
        text = text.split(marker).join(original);
    }

    return text;
}

function deepTransform(value) {
    if (Array.isArray(value)) {
        return value.map(deepTransform);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, deepTransform(nested)]));
    }

    if (typeof value === 'string') {
        return transliterateLatinToCyrillic(value);
    }

    return value;
}

const sourcePath = path.join(PUBLIC_ROOT, SOURCE_LANG, FILE_NAME);
const publicTargetPath = path.join(PUBLIC_ROOT, TARGET_LANG, FILE_NAME);
const srcTargetPath = path.join(SRC_ROOT, TARGET_LANG, FILE_NAME);

if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source locale: ${sourcePath}`);
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const target = deepTransform(source);

for (const targetPath of [publicTargetPath, srcTargetPath]) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(target, null, 2) + '\n');
    console.log(`Wrote ${targetPath} from ${sourcePath}`);
}
