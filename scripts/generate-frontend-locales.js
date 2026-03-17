// Script to generate frontend locale files based on the same languages as backend
// Run with: node scripts/generate-frontend-locales.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendLocalesDir = path.join(__dirname, '..', 'client', 'src', 'locales');

// Read the English translation as base
const enPath = path.join(frontendLocalesDir, 'en', 'translation.json');
const enTranslation = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Languages with their app names
const languages = {
    it: { appName: 'Inventario Casa', welcome: 'Benvenuto', login: 'Accedi', logout: 'Esci', settings: 'Impostazioni', home: 'Home', inventory: 'Inventario', rooms: 'Stanze', categories: 'Categorie', save: 'Salva', cancel: 'Annulla', delete: 'Elimina', edit: 'Modifica', add: 'Aggiungi', search: 'Cerca', loading: 'Caricamento...', error: 'Errore', success: 'Successo' },
    pt: { appName: 'Inventário Casa', welcome: 'Bem-vindo', login: 'Entrar', logout: 'Sair', settings: 'Configurações', home: 'Início', inventory: 'Inventário', rooms: 'Cômodos', categories: 'Categorias', save: 'Salvar', cancel: 'Cancelar', delete: 'Excluir', edit: 'Editar', add: 'Adicionar', search: 'Pesquisar', loading: 'Carregando...', error: 'Erro', success: 'Sucesso' },
    ru: { appName: 'Домашний Инвентарь', welcome: 'Добро пожаловать', login: 'Войти', logout: 'Выйти', settings: 'Настройки', home: 'Главная', inventory: 'Инвентарь', rooms: 'Комнаты', categories: 'Категории', save: 'Сохранить', cancel: 'Отмена', delete: 'Удалить', edit: 'Редактировать', add: 'Добавить', search: 'Поиск', loading: 'Загрузка...', error: 'Ошибка', success: 'Успех' },
    zh: { appName: '家庭库存', welcome: '欢迎', login: '登录', logout: '退出', settings: '设置', home: '首页', inventory: '库存', rooms: '房间', categories: '类别', save: '保存', cancel: '取消', delete: '删除', edit: '编辑', add: '添加', search: '搜索', loading: '加载中...', error: '错误', success: '成功' },
    ja: { appName: 'ホームインベントリ', welcome: 'ようこそ', login: 'ログイン', logout: 'ログアウト', settings: '設定', home: 'ホーム', inventory: 'インベントリ', rooms: '部屋', categories: 'カテゴリ', save: '保存', cancel: 'キャンセル', delete: '削除', edit: '編集', add: '追加', search: '検索', loading: '読み込み中...', error: 'エラー', success: '成功' },
    ko: { appName: '홈 인벤토리', welcome: '환영합니다', login: '로그인', logout: '로그아웃', settings: '설정', home: '홈', inventory: '인벤토리', rooms: '방', categories: '카테고리', save: '저장', cancel: '취소', delete: '삭제', edit: '편집', add: '추가', search: '검색', loading: '로딩 중...', error: '오류', success: '성공' },
    ar: { appName: 'مخزون المنزل', welcome: 'مرحباً', login: 'تسجيل الدخول', logout: 'تسجيل الخروج', settings: 'الإعدادات', home: 'الرئيسية', inventory: 'المخزون', rooms: 'الغرف', categories: 'الفئات', save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', edit: 'تحرير', add: 'إضافة', search: 'بحث', loading: 'جاري التحميل...', error: 'خطأ', success: 'نجاح' },
    he: { appName: 'מלאי בית', welcome: 'ברוך הבא', login: 'התחבר', logout: 'התנתק', settings: 'הגדרות', home: 'בית', inventory: 'מלאי', rooms: 'חדרים', categories: 'קטגוריות', save: 'שמור', cancel: 'ביטול', delete: 'מחק', edit: 'ערוך', add: 'הוסף', search: 'חיפוש', loading: 'טוען...', error: 'שגיאה', success: 'הצלחה' },
    fa: { appName: 'موجودی خانه', welcome: 'خوش آمدید', login: 'ورود', logout: 'خروج', settings: 'تنظیمات', home: 'خانه', inventory: 'موجودی', rooms: 'اتاق‌ها', categories: 'دسته‌بندی‌ها', save: 'ذخیره', cancel: 'لغو', delete: 'حذف', edit: 'ویرایش', add: 'افزودن', search: 'جستجو', loading: 'در حال بارگذاری...', error: 'خطا', success: 'موفق' },
    ur: { appName: 'گھر کی انوینٹری', welcome: 'خوش آمدید', login: 'لاگ ان', logout: 'لاگ آؤٹ', settings: 'ترتیبات', home: 'ہوم', inventory: 'انوینٹری', rooms: 'کمرے', categories: 'زمرے', save: 'محفوظ کریں', cancel: 'منسوخ کریں', delete: 'حذف کریں', edit: 'ترمیم کریں', add: 'شامل کریں', search: 'تلاش', loading: 'لوڈ ہو رہا ہے...', error: 'خرابی', success: 'کامیابی' },
    hi: { appName: 'घर की इन्वेंटरी', welcome: 'स्वागत है', login: 'लॉगिन', logout: 'लॉगआउट', settings: 'सेटिंग्स', home: 'होम', inventory: 'इन्वेंटरी', rooms: 'कमरे', categories: 'श्रेणियाँ', save: 'सहेजें', cancel: 'रद्द करें', delete: 'हटाएं', edit: 'संपादित करें', add: 'जोड़ें', search: 'खोजें', loading: 'लोड हो रहा है...', error: 'त्रुटि', success: 'सफलता' },
    nl: { appName: 'Huis Inventaris', welcome: 'Welkom', login: 'Inloggen', logout: 'Uitloggen', settings: 'Instellingen', home: 'Home', inventory: 'Inventaris', rooms: 'Kamers', categories: 'Categorieën', save: 'Opslaan', cancel: 'Annuleren', delete: 'Verwijderen', edit: 'Bewerken', add: 'Toevoegen', search: 'Zoeken', loading: 'Laden...', error: 'Fout', success: 'Succes' },
    pl: { appName: 'Inwentarz Domu', welcome: 'Witaj', login: 'Zaloguj', logout: 'Wyloguj', settings: 'Ustawienia', home: 'Strona główna', inventory: 'Inwentarz', rooms: 'Pokoje', categories: 'Kategorie', save: 'Zapisz', cancel: 'Anuluj', delete: 'Usuń', edit: 'Edytuj', add: 'Dodaj', search: 'Szukaj', loading: 'Ładowanie...', error: 'Błąd', success: 'Sukces' },
    uk: { appName: 'Домашній Інвентар', welcome: 'Ласкаво просимо', login: 'Увійти', logout: 'Вийти', settings: 'Налаштування', home: 'Головна', inventory: 'Інвентар', rooms: 'Кімнати', categories: 'Категорії', save: 'Зберегти', cancel: 'Скасувати', delete: 'Видалити', edit: 'Редагувати', add: 'Додати', search: 'Пошук', loading: 'Завантаження...', error: 'Помилка', success: 'Успіх' },
    el: { appName: 'Οικιακό Απόθεμα', welcome: 'Καλώς ήρθατε', login: 'Σύνδεση', logout: 'Αποσύνδεση', settings: 'Ρυθμίσεις', home: 'Αρχική', inventory: 'Απόθεμα', rooms: 'Δωμάτια', categories: 'Κατηγορίες', save: 'Αποθήκευση', cancel: 'Ακύρωση', delete: 'Διαγραφή', edit: 'Επεξεργασία', add: 'Προσθήκη', search: 'Αναζήτηση', loading: 'Φόρτωση...', error: 'Σφάλμα', success: 'Επιτυχία' },
    sv: { appName: 'Heminventarie', welcome: 'Välkommen', login: 'Logga in', logout: 'Logga ut', settings: 'Inställningar', home: 'Hem', inventory: 'Inventarie', rooms: 'Rum', categories: 'Kategorier', save: 'Spara', cancel: 'Avbryt', delete: 'Radera', edit: 'Redigera', add: 'Lägg till', search: 'Sök', loading: 'Laddar...', error: 'Fel', success: 'Framgång' },
    id: { appName: 'Inventaris Rumah', welcome: 'Selamat Datang', login: 'Masuk', logout: 'Keluar', settings: 'Pengaturan', home: 'Beranda', inventory: 'Inventaris', rooms: 'Ruangan', categories: 'Kategori', save: 'Simpan', cancel: 'Batal', delete: 'Hapus', edit: 'Edit', add: 'Tambah', search: 'Cari', loading: 'Memuat...', error: 'Kesalahan', success: 'Berhasil' },
    th: { appName: 'สินค้าคงคลังบ้าน', welcome: 'ยินดีต้อนรับ', login: 'เข้าสู่ระบบ', logout: 'ออกจากระบบ', settings: 'การตั้งค่า', home: 'หน้าแรก', inventory: 'สินค้าคงคลัง', rooms: 'ห้อง', categories: 'หมวดหมู่', save: 'บันทึก', cancel: 'ยกเลิก', delete: 'ลบ', edit: 'แก้ไข', add: 'เพิ่ม', search: 'ค้นหา', loading: 'กำลังโหลด...', error: 'ข้อผิดพลาด', success: 'สำเร็จ' },
    vi: { appName: 'Kho Nhà', welcome: 'Chào mừng', login: 'Đăng nhập', logout: 'Đăng xuất', settings: 'Cài đặt', home: 'Trang chủ', inventory: 'Kho', rooms: 'Phòng', categories: 'Danh mục', save: 'Lưu', cancel: 'Hủy', delete: 'Xóa', edit: 'Sửa', add: 'Thêm', search: 'Tìm kiếm', loading: 'Đang tải...', error: 'Lỗi', success: 'Thành công' }
};

// Generate translation file for each language
Object.entries(languages).forEach(([code, trans]) => {
    const langDir = path.join(frontendLocalesDir, code);
    if (!fs.existsSync(langDir)) {
        fs.mkdirSync(langDir, { recursive: true });
    }

    // Create translation based on English but with localized values
    const translation = JSON.parse(JSON.stringify(enTranslation));
    translation.app.name = trans.appName;
    translation.auth.welcome = `${trans.welcome} ${trans.appName}`;
    translation.auth.login = trans.login;
    translation.auth.logout = trans.logout;
    translation.settings.title = trans.settings;
    translation.nav.home = trans.home;
    translation.nav.inventory = trans.inventory;
    translation.nav.rooms = trans.rooms;
    translation.nav.categories = trans.categories;
    translation.common.save = trans.save;
    translation.common.cancel = trans.cancel;
    translation.common.delete = trans.delete;
    translation.common.edit = trans.edit;
    translation.common.add = trans.add;
    translation.common.search = trans.search;
    translation.common.loading = trans.loading;
    translation.common.error = trans.error;
    translation.common.success = trans.success;

    const filePath = path.join(langDir, 'translation.json');
    fs.writeFileSync(filePath, JSON.stringify(translation, null, 2));
    console.log(`Created ${code}/translation.json`);
});

// Also create directories for remaining languages with English as fallback
const remainingLangs = ['bn', 'ms', 'kk', 'sw', 'ro', 'hu', 'cs', 'sk', 'bg', 'hr', 'sr', 'sl', 'lt', 'lv', 'et', 'fi', 'no', 'da', 'is', 'ga', 'mt', 'cy', 'sq', 'mk', 'ka', 'az'];

remainingLangs.forEach(code => {
    const langDir = path.join(frontendLocalesDir, code);
    if (!fs.existsSync(langDir)) {
        fs.mkdirSync(langDir, { recursive: true });
    }
    const filePath = path.join(langDir, 'translation.json');
    if (!fs.existsSync(filePath)) {
        // Use English as base for now
        fs.writeFileSync(filePath, JSON.stringify(enTranslation, null, 2));
        console.log(`Created ${code}/translation.json (English fallback)`);
    }
});

console.log('Done generating frontend locale files!');
