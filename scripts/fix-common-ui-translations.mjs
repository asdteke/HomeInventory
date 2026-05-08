import fs from 'fs';
import path from 'path';

const LOCALES_DIR = path.join(process.cwd(), 'client', 'public', 'locales');

const FIXES = {
    fr: {
        'auth.login.header_kicker': 'Connexion sécurisée',
        'auth.login.header_title': 'Retour à votre inventaire',
        'auth.login.trust_signal': 'Privé par conception. Prend en charge la 2FA et les appareils de confiance.',
        'auth.register.eyebrow': 'Accès partagé au foyer',
        'auth.register.mode_create_body': 'Commencez votre foyer ici, puis invitez les autres.',
        'auth.register.mode_join_body': 'Rejoignez avec la clé du foyer reçue.',
        'auth.register.access_section': 'Accès au foyer',
        'auth.register.step_choose_title': 'Choisissez créer ou rejoindre',
        'auth.register.trust_private': 'Privé par conception',
        'auth.register.trust_signal': 'Privé par conception, afin que le partage du foyer reste sécurisé avec la 2FA.',
        'auth.register.submit_create': 'Créer un nouveau foyer',
        'auth.register.submit_join': 'Rejoindre le foyer',
        'settings.language_description': 'Appliquez une seule langue à la navigation, aux libellés, aux textes juridiques et au formatage des dates.',
        'settings.select_language_tooltip': 'Changer de langue. Actuelle : {{language}}',
        'settings.select_language_aria': 'Sélectionner la langue. Actuelle : {{language}}',
        'settings.house_info.access_section_title': 'Accès au foyer et membres',
        'legal.data_privacy_badge': 'Données et confidentialité'
    },
    de: {
        'auth.login.header_kicker': 'Sichere Anmeldung',
        'auth.login.header_title': 'Zurück zu deinem Inventar',
        'auth.login.trust_signal': 'Privat gedacht. Unterstützt 2FA und vertrauenswürdige Geräte.',
        'auth.register.eyebrow': 'Gemeinsamer Haushaltszugang',
        'auth.register.mode_create_body': 'Richte hier deinen Haushalt ein und lade dann andere ein.',
        'auth.register.mode_join_body': 'Tritt mit dem erhaltenen Hausschlüssel bei.',
        'auth.register.access_section': 'Haushaltszugang',
        'auth.register.step_choose_title': 'Erstellen oder beitreten wählen',
        'auth.register.trust_private': 'Privat gedacht',
        'auth.register.trust_signal': 'Privat gedacht, damit das Teilen im Haushalt mit 2FA sicher bleibt.',
        'auth.register.submit_create': 'Neuen Haushalt erstellen',
        'auth.register.submit_join': 'Haushalt beitreten',
        'settings.language_description': 'Wenden Sie eine Sprache für Navigation, Beschriftungen, Rechtstexte und Datumsformatierung an.',
        'settings.select_language_tooltip': 'Sprache ändern. Aktuell: {{language}}',
        'settings.select_language_aria': 'Sprache auswählen. Aktuell: {{language}}',
        'settings.house_info.access_section_title': 'Haushaltszugang und Mitglieder',
        'legal.data_privacy_badge': 'Daten und Datenschutz'
    },
    es: {
        'auth.login.header_kicker': 'Inicio de sesión seguro',
        'auth.login.header_title': 'Volver a tu inventario',
        'auth.login.trust_signal': 'Privado por diseño. Compatible con 2FA y dispositivos de confianza.',
        'auth.register.eyebrow': 'Acceso compartido al hogar',
        'auth.register.mode_create_body': 'Empieza aquí tu hogar y luego invita a otros.',
        'auth.register.mode_join_body': 'Únete con la Clave de la casa que recibiste.',
        'auth.register.access_section': 'Acceso al hogar',
        'auth.register.step_choose_title': 'Elige crear o unirte',
        'auth.register.trust_private': 'Privado por diseño',
        'auth.register.trust_signal': 'Privado por diseño, para que compartir el hogar siga siendo seguro con 2FA.',
        'auth.register.submit_create': 'Crear nueva casa',
        'auth.register.submit_join': 'Unirse a la casa',
        'settings.language_description': 'Aplica un solo idioma a la navegación, las etiquetas, los textos legales y el formato de fechas.',
        'settings.select_language_tooltip': 'Cambiar idioma. Actual: {{language}}',
        'settings.select_language_aria': 'Seleccionar idioma. Actual: {{language}}',
        'settings.house_info.access_section_title': 'Acceso al hogar y miembros',
        'legal.data_privacy_badge': 'Datos y privacidad'
    },
    ar: {
        'auth.login.header_kicker': 'تسجيل دخول آمن',
        'auth.login.header_title': 'العودة إلى مخزونك',
        'auth.login.trust_signal': 'خاص بطبيعته. يدعم المصادقة الثنائية والأجهزة الموثوقة.',
        'auth.register.eyebrow': 'وصول أسري مشترك',
        'auth.register.mode_create_body': 'ابدأ أسرتك هنا، ثم ادعُ الآخرين.',
        'auth.register.mode_join_body': 'انضم باستخدام مفتاح المنزل الذي تلقيته.',
        'auth.register.access_section': 'وصول المنزل',
        'auth.register.step_choose_title': 'اختر الإنشاء أو الانضمام',
        'auth.register.trust_private': 'خاص بطبيعته',
        'auth.register.trust_signal': 'خاص بطبيعته، لذا يبقى مشاركة المنزل آمنة مع 2FA.',
        'auth.register.submit_create': 'إنشاء منزل جديد',
        'auth.register.submit_join': 'الانضمام إلى المنزل',
        'settings.language_description': 'طبّق لغة واحدة على التنقل والتسميات والنصوص القانونية وتنسيق التاريخ.',
        'settings.select_language_tooltip': 'تغيير اللغة. الحالية: {{language}}',
        'settings.select_language_aria': 'اختر اللغة. الحالية: {{language}}',
        'settings.house_info.access_section_title': 'وصول المنزل والأعضاء',
        'legal.data_privacy_badge': 'البيانات والخصوصية'
    },
    ru: {
        'auth.login.header_kicker': 'Безопасный вход',
        'auth.login.header_title': 'Вернуться к вашему инвентарю',
        'auth.login.trust_signal': 'Приватность по умолчанию. Поддерживает 2FA и доверенные устройства.',
        'auth.register.eyebrow': 'Общий доступ для домохозяйства',
        'auth.register.mode_create_body': 'Начните здесь свой дом, а затем пригласите других.',
        'auth.register.mode_join_body': 'Присоединитесь с помощью полученного ключа дома.',
        'auth.register.access_section': 'Доступ к дому',
        'auth.register.step_choose_title': 'Выберите создать или присоединиться',
        'auth.register.trust_private': 'Приватность по умолчанию',
        'auth.register.trust_signal': 'Приватность по умолчанию, поэтому совместный доступ в доме остаётся безопасным с 2FA.',
        'auth.register.submit_create': 'Создать новый дом',
        'auth.register.submit_join': 'Присоединиться к дому',
        'settings.language_description': 'Применяйте один язык ко всей навигации, подписям, юридическим текстам и форматированию дат.',
        'settings.select_language_tooltip': 'Изменить язык. Текущий: {{language}}',
        'settings.select_language_aria': 'Выбрать язык. Текущий: {{language}}',
        'settings.house_info.access_section_title': 'Доступ к дому и участники',
        'legal.data_privacy_badge': 'Данные и конфиденциальность'
    },
    pt: {
        'auth.login.header_kicker': 'Entrada segura',
        'auth.login.header_title': 'Voltar ao seu inventário',
        'auth.login.trust_signal': 'Privado por design. Suporta 2FA e dispositivos confiáveis.',
        'auth.register.eyebrow': 'Acesso compartilhado ao lar',
        'auth.register.mode_create_body': 'Comece seu lar aqui e depois convide outras pessoas.',
        'auth.register.mode_join_body': 'Entre com a chave da casa que você recebeu.',
        'auth.register.access_section': 'Acesso ao lar',
        'auth.register.step_choose_title': 'Escolha criar ou entrar',
        'auth.register.trust_private': 'Privado por design',
        'auth.register.trust_signal': 'Privado por design, para que o compartilhamento do lar continue seguro com 2FA.',
        'auth.register.submit_create': 'Criar nova casa',
        'auth.register.submit_join': 'Entrar na casa',
        'settings.language_description': 'Aplique um único idioma à navegação, rótulos, textos legais e formatação de datas.',
        'settings.select_language_tooltip': 'Alterar idioma. Atual: {{language}}',
        'settings.select_language_aria': 'Selecionar idioma. Atual: {{language}}',
        'settings.house_info.access_section_title': 'Acesso ao lar e membros',
        'legal.data_privacy_badge': 'Dados e privacidade'
    },
    it: {
        'auth.login.header_kicker': 'Accesso sicuro',
        'auth.login.header_title': 'Torna al tuo inventario',
        'auth.login.trust_signal': 'Privato per progettazione. Supporta la 2FA e i dispositivi attendibili.',
        'auth.register.eyebrow': 'Accesso condiviso al nucleo familiare',
        'auth.register.mode_create_body': 'Inizia qui il tuo nucleo familiare e poi invita altri.',
        'auth.register.mode_join_body': 'Unisciti con la chiave della casa che hai ricevuto.',
        'auth.register.access_section': 'Accesso alla casa',
        'auth.register.step_choose_title': 'Scegli crea o unisciti',
        'auth.register.trust_private': 'Privato per progettazione',
        'auth.register.trust_signal': 'Privato per progettazione, così la condivisione della casa resta sicura con la 2FA.',
        'auth.register.submit_create': 'Crea una nuova casa',
        'auth.register.submit_join': 'Unisciti alla casa',
        'settings.language_description': 'Applica una sola lingua alla navigazione, alle etichette, ai testi legali e alla formattazione delle date.',
        'settings.select_language_tooltip': 'Cambia lingua. Attuale: {{language}}',
        'settings.select_language_aria': 'Seleziona lingua. Attuale: {{language}}',
        'settings.house_info.access_section_title': 'Accesso alla casa e membri',
        'legal.data_privacy_badge': 'Dati e privacy'
    },
    nl: {
        'auth.login.header_kicker': 'Veilig inloggen',
        'auth.login.header_title': 'Terug naar je inventaris',
        'auth.login.trust_signal': 'Privé van ontwerp. Ondersteunt 2FA en vertrouwde apparaten.',
        'auth.register.eyebrow': 'Gedeelde toegang tot het huishouden',
        'auth.register.mode_create_body': 'Begin hier met je huishouden en nodig daarna anderen uit.',
        'auth.register.mode_join_body': 'Neem deel met de huissleutel die je hebt ontvangen.',
        'auth.register.access_section': 'Huishoudtoegang',
        'auth.register.step_choose_title': 'Kies maken of deelnemen',
        'auth.register.trust_private': 'Privé van ontwerp',
        'auth.register.trust_signal': 'Privé van ontwerp, zodat delen binnen het huishouden veilig blijft met 2FA.',
        'auth.register.submit_create': 'Nieuw huishouden maken',
        'auth.register.submit_join': 'Deelnemen aan huishouden',
        'settings.language_description': 'Pas één taal toe op navigatie, labels, juridische tekst en datumopmaak.',
        'settings.select_language_tooltip': 'Taal wijzigen. Huidig: {{language}}',
        'settings.select_language_aria': 'Taal selecteren. Huidig: {{language}}',
        'settings.house_info.access_section_title': 'Huishoudtoegang en leden',
        'legal.data_privacy_badge': 'Gegevens en privacy'
    },
    sv: {
        'auth.login.header_kicker': 'Säker inloggning',
        'auth.login.header_title': 'Tillbaka till ditt inventarium',
        'auth.login.trust_signal': 'Integritet som standard. Stöd för 2FA och betrodda enheter.',
        'auth.register.eyebrow': 'Delad hushållsåtkomst',
        'auth.register.mode_create_body': 'Börja ditt hushåll här och bjud sedan in andra.',
        'auth.register.mode_join_body': 'Anslut med husnyckeln du fick.',
        'auth.register.access_section': 'Hushållsåtkomst',
        'auth.register.step_choose_title': 'Välj skapa eller gå med',
        'auth.register.trust_private': 'Integritet som standard',
        'auth.register.trust_signal': 'Integritet som standard, så att delning i hushållet förblir säker med 2FA.',
        'auth.register.submit_create': 'Skapa nytt hushåll',
        'auth.register.submit_join': 'Gå med i hushåll',
        'settings.language_description': 'Använd ett enda språk för navigering, etiketter, juridisk text och datumformat.',
        'settings.select_language_tooltip': 'Byt språk. Nuvarande: {{language}}',
        'settings.select_language_aria': 'Välj språk. Nuvarande: {{language}}',
        'settings.house_info.access_section_title': 'Hushållsåtkomst och medlemmar',
        'legal.data_privacy_badge': 'Data och integritet'
    },
    pl: {
        'auth.login.header_kicker': 'Bezpieczne logowanie',
        'auth.login.header_title': 'Wróć do swojego inwentarza',
        'auth.login.trust_signal': 'Prywatność z założenia. Obsługuje 2FA i zaufane urządzenia.',
        'auth.register.eyebrow': 'Wspólny dostęp do gospodarstwa domowego',
        'auth.register.mode_create_body': 'Zacznij tutaj swoje gospodarstwo domowe, a potem zaproś innych.',
        'auth.register.mode_join_body': 'Dołącz za pomocą otrzymanego klucza domu.',
        'auth.register.access_section': 'Dostęp do domu',
        'auth.register.step_choose_title': 'Wybierz utwórz lub dołącz',
        'auth.register.trust_private': 'Prywatność z założenia',
        'auth.register.trust_signal': 'Prywatność z założenia, więc udostępnianie w domu pozostaje bezpieczne dzięki 2FA.',
        'auth.register.submit_create': 'Utwórz nowy dom',
        'auth.register.submit_join': 'Dołącz do domu',
        'settings.language_description': 'Zastosuj jeden język do nawigacji, etykiet, tekstów prawnych i formatowania dat.',
        'settings.select_language_tooltip': 'Zmień język. Aktualny: {{language}}',
        'settings.select_language_aria': 'Wybierz język. Aktualny: {{language}}',
        'settings.house_info.access_section_title': 'Dostęp do domu i członkowie',
        'legal.data_privacy_badge': 'Dane i prywatność'
    },
    ko: {
        'auth.login.header_kicker': '안전한 로그인',
        'auth.login.header_title': '인벤토리로 돌아가기',
        'auth.login.trust_signal': '설계상 개인 정보 보호. 2FA와 신뢰할 수 있는 장치를 지원합니다.',
        'auth.register.eyebrow': '공유 가정 접근',
        'auth.register.mode_create_body': '여기서 가정을 시작한 다음 다른 사람을 초대하세요.',
        'auth.register.mode_join_body': '받은 하우스 키로 참여하세요.',
        'auth.register.access_section': '가정 접근',
        'auth.register.step_choose_title': '만들기 또는 참여 선택',
        'auth.register.trust_private': '설계상 개인 정보 보호',
        'auth.register.trust_signal': '설계상 개인 정보 보호이므로 2FA로 가정 공유를 안전하게 유지합니다.',
        'auth.register.submit_create': '새 가정 만들기',
        'auth.register.submit_join': '가정에 참여',
        'settings.language_description': '탐색, 레이블, 법적 문구, 날짜 형식에 하나의 언어를 적용합니다.',
        'settings.select_language_tooltip': '언어 변경. 현재: {{language}}',
        'settings.select_language_aria': '언어 선택. 현재: {{language}}',
        'settings.house_info.access_section_title': '가정 접근 및 구성원',
        'legal.data_privacy_badge': '데이터와 개인정보'
    },
    ja: {
        'auth.login.header_kicker': '安全なサインイン',
        'auth.login.header_title': '在庫に戻る',
        'auth.login.trust_signal': '設計段階からプライベート。2FA と信頼済みデバイスに対応しています。',
        'auth.register.eyebrow': '共有世帯アクセス',
        'auth.register.mode_create_body': 'ここで世帯を始めて、あとで他の人を招待してください。',
        'auth.register.mode_join_body': '受け取ったハウスキーで参加してください。',
        'auth.register.access_section': '世帯アクセス',
        'auth.register.step_choose_title': '作成または参加を選択',
        'auth.register.trust_private': '設計段階からプライベート',
        'auth.register.trust_signal': '設計段階からプライベートなので、世帯の共有も 2FA で安全です。',
        'auth.register.submit_create': '新しい世帯を作成',
        'auth.register.submit_join': '世帯に参加',
        'settings.language_description': 'ナビゲーション、ラベル、法的文書、日付書式に 1 つの言語を適用します。',
        'settings.select_language_tooltip': '言語を変更します。現在: {{language}}',
        'settings.select_language_aria': '言語を選択します。現在: {{language}}',
        'settings.house_info.access_section_title': '世帯アクセスとメンバー',
        'legal.data_privacy_badge': 'データとプライバシー'
    },
    'zh-Hans': {
        'auth.login.header_kicker': '安全登录',
        'auth.login.header_title': '返回你的库存',
        'auth.login.trust_signal': '从设计上就是私密的。支持 2FA 和受信任设备。',
        'auth.register.eyebrow': '共享家庭访问',
        'auth.register.mode_create_body': '先在这里创建你的家庭，然后再邀请其他人。',
        'auth.register.mode_join_body': '使用你收到的家庭密钥加入。',
        'auth.register.access_section': '家庭访问',
        'auth.register.step_choose_title': '选择创建或加入',
        'auth.register.trust_private': '从设计上就是私密的',
        'auth.register.trust_signal': '从设计上就是私密的，因此家庭共享在 2FA 保护下依然安全。',
        'auth.register.submit_create': '创建新家庭',
        'auth.register.submit_join': '加入家庭',
        'settings.language_description': '将一种语言统一用于导航、标签、法律文本和日期格式。',
        'settings.select_language_tooltip': '更改语言。当前：{{language}}',
        'settings.select_language_aria': '选择语言。当前：{{language}}',
        'settings.house_info.access_section_title': '家庭访问与成员',
        'legal.data_privacy_badge': '数据与隐私'
    },
    'zh-Hant': {
        'auth.login.header_kicker': '安全登入',
        'auth.login.header_title': '返回你的庫存',
        'auth.login.trust_signal': '從設計上即注重隱私。支援 2FA 與信任裝置。',
        'auth.register.eyebrow': '共享家庭存取',
        'auth.register.mode_create_body': '先在這裡建立你的家庭，之後再邀請其他人。',
        'auth.register.mode_join_body': '使用你收到的家庭金鑰加入。',
        'auth.register.access_section': '家庭存取',
        'auth.register.step_choose_title': '選擇建立或加入',
        'auth.register.trust_private': '從設計上即注重隱私',
        'auth.register.trust_signal': '從設計上即注重隱私，因此家庭共享在 2FA 保護下依然安全。',
        'auth.register.submit_create': '建立新家庭',
        'auth.register.submit_join': '加入家庭',
        'settings.language_description': '將同一語言套用於導覽、標籤、法律文字與日期格式。',
        'settings.select_language_tooltip': '變更語言。目前：{{language}}',
        'settings.select_language_aria': '選擇語言。目前：{{language}}',
        'settings.house_info.access_section_title': '家庭存取與成員',
        'legal.data_privacy_badge': '資料與隱私'
    }
};

function setDeepValue(object, keyPath, value) {
    const parts = keyPath.split('.');
    let current = object;
    for (let i = 0; i < parts.length - 1; i += 1) {
        const part = parts[i];
        if (!current[part] || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
}

function main() {
    let updatedFiles = 0;

    for (const [lang, translations] of Object.entries(FIXES)) {
        const filePath = path.join(LOCALES_DIR, lang, 'translation.json');
        if (!fs.existsSync(filePath)) continue;

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let changed = false;

        for (const [keyPath, value] of Object.entries(translations)) {
            setDeepValue(content, keyPath, value);
            changed = true;
        }

        if (changed) {
            fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
            updatedFiles += 1;
        }
    }

    console.log(`Updated ${updatedFiles} locale file(s) with common UI translations.`);
}

main();
