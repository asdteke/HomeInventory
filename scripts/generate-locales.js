// Script to generate remaining backend locale files
// Run with: node scripts/generate-locales.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Remaining languages to generate with their translations
const translations = {
    bn: { name: 'বাংলা', items: { added: 'আইটেম যোগ করা হয়েছে', updated: 'আইটেম আপডেট করা হয়েছে', deleted: 'আইটেম মুছে ফেলা হয়েছে' }, auth: { login_success: 'লগইন সফল', login_error: 'লগইন ত্রুটি' } },
    ms: { name: 'Bahasa Melayu', items: { added: 'Item ditambah', updated: 'Item dikemas kini', deleted: 'Item dipadam' }, auth: { login_success: 'Log masuk berjaya', login_error: 'Ralat log masuk' } },
    kk: { name: 'Қазақша', items: { added: 'Элемент қосылды', updated: 'Элемент жаңартылды', deleted: 'Элемент жойылды' }, auth: { login_success: 'Кіру сәтті', login_error: 'Кіру қатесі' } },
    sw: { name: 'Kiswahili', items: { added: 'Kipengee kimeongezwa', updated: 'Kipengee kimesasishwa', deleted: 'Kipengee kimefutwa' }, auth: { login_success: 'Kuingia kumefaulu', login_error: 'Hitilafu ya kuingia' } },
    ro: { name: 'Română', items: { added: 'Articol adăugat', updated: 'Articol actualizat', deleted: 'Articol șters' }, auth: { login_success: 'Autentificare reușită', login_error: 'Eroare de autentificare' } },
    hu: { name: 'Magyar', items: { added: 'Elem hozzáadva', updated: 'Elem frissítve', deleted: 'Elem törölve' }, auth: { login_success: 'Sikeres bejelentkezés', login_error: 'Bejelentkezési hiba' } },
    cs: { name: 'Čeština', items: { added: 'Položka přidána', updated: 'Položka aktualizována', deleted: 'Položka smazána' }, auth: { login_success: 'Přihlášení úspěšné', login_error: 'Chyba přihlášení' } },
    sk: { name: 'Slovenčina', items: { added: 'Položka pridaná', updated: 'Položka aktualizovaná', deleted: 'Položka zmazaná' }, auth: { login_success: 'Prihlásenie úspešné', login_error: 'Chyba prihlásenia' } },
    bg: { name: 'Български', items: { added: 'Елементът е добавен', updated: 'Елементът е актуализиран', deleted: 'Елементът е изтрит' }, auth: { login_success: 'Успешен вход', login_error: 'Грешка при вход' } },
    hr: { name: 'Hrvatski', items: { added: 'Stavka dodana', updated: 'Stavka ažurirana', deleted: 'Stavka obrisana' }, auth: { login_success: 'Uspješna prijava', login_error: 'Greška prijave' } },
    sr: { name: 'Српски', items: { added: 'Ставка додата', updated: 'Ставка ажурирана', deleted: 'Ставка обрисана' }, auth: { login_success: 'Успешна пријава', login_error: 'Грешка при пријави' } },
    sl: { name: 'Slovenščina', items: { added: 'Element dodan', updated: 'Element posodobljen', deleted: 'Element izbrisan' }, auth: { login_success: 'Uspešna prijava', login_error: 'Napaka prijave' } },
    lt: { name: 'Lietuvių', items: { added: 'Elementas pridėtas', updated: 'Elementas atnaujintas', deleted: 'Elementas ištrintas' }, auth: { login_success: 'Prisijungimas sėkmingas', login_error: 'Prisijungimo klaida' } },
    lv: { name: 'Latviešu', items: { added: 'Vienums pievienots', updated: 'Vienums atjaunināts', deleted: 'Vienums dzēsts' }, auth: { login_success: 'Veiksmīga pieteikšanās', login_error: 'Pieteikšanās kļūda' } },
    et: { name: 'Eesti', items: { added: 'Üksus lisatud', updated: 'Üksus uuendatud', deleted: 'Üksus kustutatud' }, auth: { login_success: 'Sisselogimine õnnestus', login_error: 'Sisselogimise viga' } },
    fi: { name: 'Suomi', items: { added: 'Kohde lisätty', updated: 'Kohde päivitetty', deleted: 'Kohde poistettu' }, auth: { login_success: 'Kirjautuminen onnistui', login_error: 'Kirjautumisvirhe' } },
    no: { name: 'Norsk', items: { added: 'Element lagt til', updated: 'Element oppdatert', deleted: 'Element slettet' }, auth: { login_success: 'Pålogging vellykket', login_error: 'Påloggingsfeil' } },
    da: { name: 'Dansk', items: { added: 'Element tilføjet', updated: 'Element opdateret', deleted: 'Element slettet' }, auth: { login_success: 'Login lykkedes', login_error: 'Login fejl' } },
    is: { name: 'Íslenska', items: { added: 'Hlut bætt við', updated: 'Hlutur uppfærður', deleted: 'Hlutur eytt' }, auth: { login_success: 'Innskráning tókst', login_error: 'Innskráningarvilla' } },
    ga: { name: 'Gaeilge', items: { added: 'Mír curtha leis', updated: 'Mír nuashonraithe', deleted: 'Mír scriosta' }, auth: { login_success: "D'éirigh le logáil isteach", login_error: 'Earráid logála isteach' } },
    mt: { name: 'Malti', items: { added: 'Oġġett miżjud', updated: 'Oġġett aġġornat', deleted: 'Oġġett imħassar' }, auth: { login_success: 'Login irnexxielu', login_error: 'Żball fil-login' } },
    cy: { name: 'Cymraeg', items: { added: 'Eitem wedi\'i hychwanegu', updated: 'Eitem wedi\'i diweddaru', deleted: 'Eitem wedi\'i dileu' }, auth: { login_success: 'Mewngofnodi\'n llwyddiannus', login_error: 'Gwall mewngofnodi' } },
    sq: { name: 'Shqip', items: { added: 'Artikulli u shtua', updated: 'Artikulli u përditësua', deleted: 'Artikulli u fshi' }, auth: { login_success: 'Hyrja me sukses', login_error: 'Gabim hyrjeje' } },
    mk: { name: 'Македонски', items: { added: 'Ставката е додадена', updated: 'Ставката е ажурирана', deleted: 'Ставката е избришана' }, auth: { login_success: 'Успешна најава', login_error: 'Грешка при најава' } },
    ka: { name: 'ქართული', items: { added: 'ელემენტი დამატებულია', updated: 'ელემენტი განახლებულია', deleted: 'ელემენტი წაშლილია' }, auth: { login_success: 'შესვლა წარმატებულია', login_error: 'შესვლის შეცდომა' } },
    az: { name: 'Azərbaycan', items: { added: 'Element əlavə edildi', updated: 'Element yeniləndi', deleted: 'Element silindi' }, auth: { login_success: 'Giriş uğurlu', login_error: 'Giriş xətası' } }
};

// Base template from English
const baseTemplate = {
    common: { error: 'An error occurred', success: 'Operation successful', not_found: 'Not found', unauthorized: 'Unauthorized access', forbidden: 'Permission denied', validation_error: 'Validation error', server_error: 'Server error' },
    auth: { login_required: 'Please log in', invalid_token: 'Invalid or expired token', admin_required: 'Admin required', authorization_required: 'Authorization required', fill_all_fields: 'Fill all fields', email_already_registered: 'Email already registered', username_already_registered: 'Username already registered', email_pending_verification: 'Verification pending', username_pending_verification: 'Verification pending', invalid_house_key: 'Invalid house key', registration_success: 'Registration successful!', registration_error: 'Registration error', username_password_required: 'Username and password required', invalid_credentials: 'Invalid credentials', account_banned: 'Account banned', login_success: 'Login successful', login_error: 'Login error', user_not_found: 'User not found', current_password_wrong: 'Current password wrong', passwords_dont_match: 'Passwords do not match', password_too_short: 'Password too short', password_change_success: 'Password changed', password_change_error: 'Password change error', database_error: 'Database error', database_read_error: 'Database read error', new_password_error: 'New password error', email_verification_required: 'Email verification required', verification_link_expired: 'Verification link expired', email_verified_success: 'Email verified!', email_send_error: 'Email send error' },
    items: { added: 'Item added', updated: 'Item updated', deleted: 'Item deleted', not_found: 'Item not found', load_error: 'Error loading items', add_error: 'Error adding item', update_error: 'Error updating item', delete_error: 'Error deleting item', no_permission: 'No permission', barcode_search_error: 'Barcode search failed', stats_error: 'Stats error' },
    categories: { added: 'Category added', updated: 'Category updated', deleted: 'Category deleted', not_found: 'Category not found', name_required: 'Name required', load_error: 'Error loading', add_error: 'Error adding', update_error: 'Error updating', delete_error: 'Error deleting' },
    rooms: { added: 'Room added', updated: 'Room updated', deleted: 'Room deleted', not_found: 'Room not found', name_required: 'Name required', load_error: 'Error loading', add_error: 'Error adding', update_error: 'Error updating', delete_error: 'Error deleting' },
    locations: { added: 'Location added', updated: 'Location updated', deleted: 'Location deleted', not_found: 'Location not found', name_required: 'Name required', room_required: 'Room required', load_error: 'Error loading', add_error: 'Error adding', update_error: 'Error updating', delete_error: 'Error deleting' },
    admin: { users_loaded: 'Users loaded', user_banned: 'User banned', user_unbanned: 'User unbanned', user_deleted: 'User deleted', attempts_reset: 'Attempts reset', stats_loaded: 'Stats loaded', logs_loaded: 'Logs loaded', load_error: 'Error loading', action_error: 'Action error' },
    email: { sent: 'Email sent', send_error: 'Send error', invalid_email: 'Invalid email', subject_required: 'Subject required', message_required: 'Message required' },
    barcode: { not_found: 'Barcode not found', search_error: 'Search error', invalid_code: 'Invalid code' },
    rate_limit: { too_many_requests: 'Too many requests', too_many_login_attempts: 'Too many login attempts' },
    house: { created: 'House created', joined: 'Joined house', invalid_key: 'Invalid key', members_loaded: 'Members loaded', key_copied: 'Key copied' }
};

const localesDir = path.join(__dirname, '..', 'locales');

Object.entries(translations).forEach(([code, trans]) => {
    const locale = JSON.parse(JSON.stringify(baseTemplate));
    // Merge specific translations
    if (trans.items) Object.assign(locale.items, trans.items);
    if (trans.auth) Object.assign(locale.auth, trans.auth);

    const filePath = path.join(localesDir, `${code}.json`);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(locale, null, 2));
        console.log(`Created ${code}.json`);
    }
});

console.log('Done generating locale files!');
