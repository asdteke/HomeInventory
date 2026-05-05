const ROOM_ALIAS_TO_ID = {
    "balcony": "balcony",
    "balkon": "balcony",
    "banyo": "bathroom",
    "bathroom": "bathroom",
    "bedroom": "bedroom",
    "calısma odası": "office",
    "cocuk odası": "kids_room",
    "depo": "storage",
    "garage": "garage",
    "garaj": "garage",
    "kids room": "kids_room",
    "kitchen": "kitchen",
    "living room": "living_room",
    "mutfak": "kitchen",
    "office": "office",
    "oturma odası": "living_room",
    "storage": "storage",
    "yatak odası": "bedroom",
    "ավտոտնակ": "garage",
    "գրասենյակ": "office",
    "լոգարան": "bathroom",
    "խոհանոց": "kitchen",
    "հյուրասենյակ": "living_room",
    "մանկական սենյակ": "kids_room",
    "ննջասենյակ": "bedroom",
    "պահեստ": "storage",
    "պատշգամբ": "balcony"
};
const CATEGORY_ALIAS_TO_ID = {
    "aletler": "tools",
    "books": "books",
    "clothing": "clothing",
    "diger": "other",
    "electronics": "electronics",
    "elektronik": "electronics",
    "furniture": "furniture",
    "giyim": "clothing",
    "hobbies": "hobbies",
    "hobiler": "hobbies",
    "kitaplar": "books",
    "kitchen": "kitchen",
    "mobilya": "furniture",
    "mutfak": "kitchen",
    "other": "other",
    "spor": "sports",
    "sports": "sports",
    "tools": "tools",
    "այլ": "other",
    "գործիքներ": "tools",
    "գրքեր": "books",
    "էլեկտրոնիկա": "electronics",
    "խոհանոց": "kitchen",
    "կահույք": "furniture",
    "հագուստ": "clothing",
    "հոբբիներ": "hobbies",
    "սպորտ": "sports"
};

function normalizeAliasText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

export { ROOM_ALIAS_TO_ID, CATEGORY_ALIAS_TO_ID, normalizeAliasText };
