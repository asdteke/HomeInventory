const DEFAULT_PROTECTED_TRANSLATION_KEYS = new Set([
    'app.name',
    'auth.placeholder_password',
    'admin.email.placeholder_to',
    'admin.logs.date_fmt',
    'beta_banner.badge',
    'beta_banner.title',
    'dashboard.top_bar.beta',
    'emails.adminEmail.footer',
    'emails.passwordReset.footer',
    'emails.testEmail.footer',
    'emails.verification.footer',
    'emails.welcome.footer',
    'emails.houseJoinDecision.subjectTemplate',
    'items.qrcode.title',
    'settings.house_info.mask_key',
    'notifications.items.date_body',
    'notifications.items.maintenance_body',
    'notifications.items.stock_body'
]);

const DEFAULT_IDENTICAL_TRANSLATION_ALLOWLIST = {
    "af": new Set([
        "admin.users.status",
        "borrow_requests.dialogs.item_label",
        "inventory.visibility_mine",
        "maintenance.freq.unit.weeks",
        "settings.data_management.preview_items",
    ]),
    "bs": new Set([
        "admin.users.status",
        "settings.about.beta_title",
    ]),
    "ca": new Set([
        "auth.recovery_key_modal.important",
        "auth.register.modals.key_created.important",
        "categories.color",
        "categories.color_label",
        "categories.title",
        "common.total",
        "dashboard.categories.title",
        "dashboard.quick_actions.categories",
        "dashboard.stats.category_count",
        "intro.categories.title",
        "intro.categories_title",
        "legal.consent_doc01_label",
        "legal.consent_doc02_label",
        "nav.categories",
        "navigation.categories",
        "settings.data_management.preview_categories",
    ]),
    "ceb": new Set([
        "admin.logs.type.email",
        "admin.tabs.dashboard",
        "alerts.low_stock.qty",
        "auth.email",
        "auth.register.email",
        "auth.register.password",
        "inventory.grid_view",
        "items.barcode",
        "items.form.barcode",
        "nav.menu",
        "rooms.icon",
    ]),
    "cs": new Set([
        "admin.overview.sections.activity_eyebrow",
        "admin.users.role",
        "navigation.menu",
        "settings.control_sections.data",
    ]),
    "cy": new Set([
        "inventory.grid_view",
        "settings.control_sections.data",
    ]),
    "da": new Set([
        "admin.email.info_title",
        "admin.logs.type.system",
        "admin.users.status",
        "common.download",
        "common.total",
        "item_qr.download",
        "nav.menu",
        "navigation.menu",
        "qr.scan",
        "rooms.defaults.garage.name",
        "settings.about.feedback_subject",
        "settings.about.version",
        "settings.control_sections.data",
        "settings.version",
    ]),
    "de": new Set([
        "admin.logs.type.system",
        "admin.users.status",
        "inventory.sort_name_asc",
        "inventory.sort_name_desc",
        "items.form.barcode_optional",
        "items.form.location_optional",
        "landing.hero.free_badge",
        "rooms.defaults.garage.name",
        "settings.about.version",
        "settings.version",
    ]),
    "es": new Set([
        "categories.color",
        "categories.color_label",
    ]),
    "et": new Set([
        "admin.overview.sections.activity_eyebrow",
    ]),
    "fil": new Set([
        "admin.logs.type.email",
        "admin.tabs.dashboard",
        "admin.users.role_admin",
        "alerts.low_stock.qty",
        "auth.email",
        "auth.login.password",
        "auth.register.email",
        "auth.register.password",
        "dashboard.title",
        "inventory.grid_view",
        "items.barcode",
        "items.form.barcode",
        "settings.account",
        "settings.control_sections.account",
        "settings.two_factor.password_label",
    ]),
    "fr": new Set([
        "admin.email.compose_eyebrow",
        "admin.overview.sections.activity_eyebrow",
        "admin.users.action",
        "alerts.low_stock.qty",
        "common.total",
        "emails.testEmail.serviceLabel",
        "items.description",
        "items.form.description",
        "items.form.photo",
        "items.photo",
        "legal.consent_doc01_label",
        "legal.consent_doc02_label",
        "legal.contact",
        "legal.page_label",
        "maintenance.fields.description",
        "nav.menu",
        "navigation.menu",
        "navigation.notifications",
        "navigation.service",
        "notifications.meta_total",
        "rooms.defaults.garage.name",
        "settings.about.version",
        "settings.notifications",
        "settings.version",
        "terms.contact",
    ]),
    "hr": new Set([
        "admin.users.status",
    ]),
    "ht": new Set([
        "common.total",
    ]),
    "id": new Set([
        "admin.overview.sections.activity_eyebrow",
        "admin.users.role_admin",
        "admin.users.status",
        "settings.control_sections.data",
    ]),
    "ig": new Set([
        "settings.control_sections.data",
    ]),
    "it": new Set([
        "auth.login.password",
        "auth.register.password",
        "landing.hero.free_badge",
        "rooms.defaults.garage.name",
        "settings.account",
        "settings.backup",
        "settings.control_sections.account",
        "settings.danger_zone.title",
    ]),
    "lb": new Set([
        "admin.users.status",
        "settings.about.feedback_subject",
    ]),
    "ms": new Set([
        "admin.overview.sections.activity_eyebrow",
        "admin.users.status",
        "nav.menu",
        "navigation.menu",
        "settings.control_sections.data",
        "settings.import_data",
    ]),
    "mt": new Set([
        "auth.login.password",
        "auth.register.password",
        "dashboard.quick_actions.settings",
        "nav.menu",
        "navigation.menu",
        "navigation.settings",
        "settings.about.feedback_subject",
        "settings.backup",
        "settings.control_sections.data",
        "settings.title",
        "settings.two_factor.password_label",
    ]),
    "nl": new Set([
        "admin.meta.users_total",
        "admin.tabs.dashboard",
        "admin.users.status",
        "beta_banner.contact",
        "common.details",
        "common.record_count",
        "dashboard.title",
        "footer.contact",
        "legal.consent_doc01_label",
        "legal.consent_doc02_label",
        "legal.contact",
        "maintenance.freq.unit.weeks",
        "nav.menu",
        "navigation.menu",
        "rooms.defaults.garage.name",
        "settings.about.feedback_subject",
        "settings.two_factor.method_totp",
        "terms.contact",
    ]),
    "no": new Set([
        "admin.logs.type.system",
        "admin.users.status",
        "settings.control_sections.data",
    ]),
    "pl": new Set([
        "admin.logs.type.system",
        "admin.users.status",
        "nav.menu",
        "navigation.menu",
    ]),
    "pt": new Set([
        "admin.users.status",
        "borrow_requests.dialogs.item_label",
        "common.total",
    ]),
    "ro": new Set([
        "admin.overview.sections.activity_eyebrow",
        "auth.recovery_key_modal.important",
        "auth.register.modals.key_created.important",
        "beta_banner.contact",
        "common.total",
        "dashboard.filters.public",
        "dashboard.public_items",
        "footer.contact",
        "items.is_public",
        "settings.about.feedback_subject",
        "terms.contact",
    ]),
    "sk": new Set([
        "admin.overview.sections.activity_eyebrow",
    ]),
    "sl": new Set([
        "common.filter",
    ]),
    "sq": new Set([
        "admin.logs.type.email",
        "auth.email",
        "auth.register.email",
    ]),
    "sv": new Set([
        "admin.email.info_title",
        "admin.logs.type.system",
        "admin.users.status",
        "rooms.defaults.garage.name",
        "settings.about.version",
        "settings.control_sections.data",
        "settings.version",
    ]),
};

function splitEnvList(value) {
    return String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

/**
 * Determines if a translation key path should be protected from automatic translation/overwrite.
 * @param {string} key
 * @returns {boolean}
 */
export function isProtectedTranslationKey(key) {
    const exactKeys = new Set([
        ...DEFAULT_PROTECTED_TRANSLATION_KEYS,
        ...splitEnvList(process.env.PROTECTED_TRANSLATION_KEYS)
    ]);
    if (exactKeys.has(key)) {
        return true;
    }

    const prefixes = splitEnvList(process.env.PROTECTED_TRANSLATION_KEY_PREFIXES);
    return prefixes.some((prefix) => key.startsWith(prefix));
}

export function isAllowedIdenticalTranslation(key, language) {
    const normalizedLanguage = String(language || '').trim();
    return Boolean(DEFAULT_IDENTICAL_TRANSLATION_ALLOWLIST[normalizedLanguage]?.has(key));
}
