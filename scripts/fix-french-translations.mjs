import fs from 'fs';
import path from 'path';

function setDeepValue(object, keyPath, value) {
    const parts = keyPath.split('.');
    let current = object;

    for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index];
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }

    current[parts.at(-1)] = value;
}

function applyCorrections(filePath, corrections) {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    for (const [keyPath, value] of Object.entries(corrections)) {
        setDeepValue(content, keyPath, value);
    }

    fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`);
    console.log(`Updated ${filePath}`);
}

const privacyPolicyContent = `## Aperçu
**{{brandName}}** est un logiciel open source et peut être fourni via une installation officielle ou auto-hébergée. Pour cette installation, le responsable du traitement ou l'opérateur du service est **{{controllerName}}**.
- **Adresse du responsable :** {{controllerAddress}}
- **Contact confidentialité :** {{privacyEmail}}
- **Contact support général :** {{supportEmail}}

Cet avis explique **quelles données personnelles sont traitées**, **comment elles sont obtenues**, **pourquoi elles sont traitées**, **qui peut les recevoir**, **combien de temps elles sont conservées** et **quels droits vous pouvez avoir**.

Si cette installation est exploitée par un tiers, cet opérateur est responsable de l'identité du responsable propre au déploiement, des engagements d'assistance, des détails de transfert, des paramètres de conservation et des mentions légales locales applicables.

## Données que nous collectons et traitons
- **Données de compte :** nom d'utilisateur, adresse e-mail, hachage du mot de passe, cookies de session, données d'appareil de confiance et journaux de sécurité.
- **Données de service :** maisons, pièces, catégories, articles, médias téléversés, demandes de prêt et enregistrements du coffre-fort personnel que vous créez.
- **Données techniques :** adresse IP, identifiants du navigateur ou de la session et données de préférence linguistique nécessaires à la localisation et à la sécurité du compte.
- **Données facultatives du fournisseur d'identité :** si vous choisissez Google Sign-In, Google partage avec nous votre adresse e-mail, l'identifiant de votre compte Google et le nom d'affichage de votre profil afin que nous puissions vous authentifier ou créer votre compte.
- **Données facultatives de recherche :** si vous utilisez la recherche par code-barres ou par produit, la valeur du code-barres que vous soumettez peut être envoyée par notre serveur à Open Food Facts, Open Products Facts, Open Beauty Facts ou Google afin que le résultat demandé puisse être renvoyé.

## Comment nous obtenons les données
- **Directement de vous :** lorsque vous vous inscrivez, vous connectez, créez ou modifiez des enregistrements, téléversez des médias, configurez des paramètres de sécurité ou contactez l'assistance.
- **Automatiquement depuis votre navigateur ou appareil :** grâce aux cookies de session requis, aux mécanismes d'appareil de confiance, au traitement de l'adresse IP, à la préférence linguistique et aux journaux de sécurité nécessaires pour faire fonctionner et protéger l'application.
- **Depuis Google :** uniquement si vous choisissez Google Sign-In, et dans la limite des données d'identité nécessaires pour vous authentifier ou créer votre compte.
- **Depuis des sources externes de données produit :** uniquement si vous déclenchez une recherche par code-barres ou produit, et dans la limite de la requête de recherche et des métadonnées produit renvoyées.

## Pourquoi nous les traitons
- **Fonctionnement du compte :** pour créer et exploiter votre compte.
- **Authentification et sécurité :** pour vous authentifier et sécuriser les sessions ainsi que l'authentification à deux facteurs.
- **Fonctionnalités principales :** pour fournir l'inventaire, les sauvegardes et les fonctions du Coffre-fort personnel.
- **Assistance :** pour répondre aux demandes de support.
- **Fonctionnalités facultatives de connexion et de recherche :** pour finaliser Google Sign-In et la recherche externe de produits ou de codes-barres uniquement lorsque vous choisissez ces fonctions.
- **Obligations légales et de sécurité :** pour satisfaire les obligations légales ou de sécurité.

## Base légale et méthode de collecte
- **Dans le cadre du RGPD, lorsque cela s'applique :** le traitement est fondé sur l'exécution du contrat, les obligations légales, le consentement pour toute fonctionnalité reposant sur le consentement, et l'intérêt légitime de l'opérateur pour la sécurité du service et du compte.
- **Dans le cadre du KVKK, lorsque cela s'applique :** le traitement est fondé sur les bases légales des articles 5 et 6, notamment lorsque cela est nécessaire à la conclusion ou à l'exécution d'un contrat, au respect des obligations légales, à l'exercice ou à la protection de droits, ou aux intérêts légitimes du responsable, à condition que vos droits et libertés fondamentaux ne soient pas lésés.
- **Méthode de collecte :** les données sont collectées par voie électronique via des formulaires, des sessions authentifiées, les cookies requis, les flux OAuth facultatifs, les journaux d'application, les téléversements et les requêtes API.

## Stockage et transfert
- **Nous ne vendons pas de données personnelles.**
- Les données personnelles peuvent être reçues par les fournisseurs d'hébergement, de base de données, de stockage, de messagerie, d'authentification et d'infrastructure utilisés pour faire fonctionner cette installation.
- Si vous choisissez Google Sign-In ou la recherche de produit ou de code-barres, les données d'authentification ou de recherche concernées sont partagées avec le fournisseur sélectionné uniquement pour terminer la fonctionnalité que vous avez déclenchée.
- Les données peuvent être communiquées aux tribunaux, aux régulateurs ou aux autorités publiques lorsque la loi l'exige.
- **Transfert pour cette installation :** {{transferDisclosure}}
- Les données de compte sont conservées tant que votre compte est actif.
- Lorsque vous supprimez votre compte depuis les Paramètres, vos données de compte, le contenu du coffre-fort personnel, les médias téléversés et les enregistrements d'application détenus par votre compte sont supprimés de l'application sans retard injustifié, sauf les informations qui doivent être conservées pour des réclamations juridiques, des obligations légales ou des exigences de sécurité.

## Vos droits
- Selon la loi applicable, vous pouvez demander une confirmation quant au traitement de vos données personnelles, y accéder et obtenir des informations sur les finalités, catégories, destinataires et transferts.
- Vous pouvez demander la rectification, l'effacement, la destruction, la limitation ou l'opposition, ainsi que la portabilité des données lorsqu'elle est applicable.
- Lorsque le traitement est fondé sur le consentement, vous pouvez le retirer à tout moment sans affecter le traitement licite antérieur.
- Vous pouvez demander que les résultats de correction, de suppression ou de destruction soient communiqués aux destinataires lorsque la loi l'exige.
- Vous pouvez vous opposer aux résultats produits exclusivement par des moyens automatisés si la loi vous accorde ce droit.
- Lorsque la loi le permet, vous pouvez demander réparation du préjudice causé par un traitement illicite.
- Vous pouvez déposer une plainte auprès de **{{complaintAuthority}}**

## Comment exercer vos droits
- Utilisez le flux intégré de suppression de compte ou contactez **{{privacyEmail}}** pour toute demande liée à la confidentialité.
- Lorsque le RGPD s'applique, les demandes doivent être traitées sans retard injustifié et, en principe, dans le mois suivant la vérification d'identité.

## Décision automatisée
- Cette application n'utilise pas de prise de décision ou de profilage exclusivement automatisé produisant des effets juridiques ou significatifs similaires à votre égard.

## Remarque importante
Cet avis est fourni à titre de transparence. **Il est distinct de tout consentement facultatif au marketing, à l'analyse ou aux cookies non essentiels**, qui doit être demandé séparément lorsque la loi l'exige.

Les mainteneurs du projet open source en amont ne sont pas automatiquement le responsable du traitement ou le sous-traitant pour les déploiements tiers auto-hébergés.`;

const termsOfServiceContent = `Conditions d'utilisation

1. Aperçu
{{brandName}} est un logiciel open source et peut être utilisé via des installations officielles ou auto-hébergées. Les présentes conditions s'appliquent à l'installation spécifique que vous utilisez.
- Si cette installation est exploitée par un tiers, cet opérateur peut compléter ces conditions par des règles propres au déploiement, des engagements d'assistance ou des mentions légales locales.

2. Règles d'utilisation
- Vous êtes responsable de la légalité, de l'exactitude et de la propriété du contenu que vous placez dans le service.
- La disponibilité en open source du logiciel ne vous donne pas le droit de téléverser, stocker ou partager des données que vous n'êtes pas autorisé à utiliser.
- Nous pouvons suspendre ou supprimer les comptes qui abusent du service, violent les présentes conditions ou créent un risque de sécurité ou juridique.

3. Sécurité du compte
- Conservez votre mot de passe, vos supports de récupération et vos sauvegardes en lieu sûr.

4. Cycle de vie des données
- Conservez vos propres sauvegardes des informations importantes.
- La suppression de votre compte depuis les Paramètres supprime définitivement les données de l'application et les médias téléversés appartenant à votre compte et ne peut pas être annulée.

5. Limites et clauses de non-responsabilité
- La disponibilité, l'assistance, les intégrations et les délais de réponse dépendent de l'opérateur de cette installation.
- Le service est fourni « tel quel » et « selon disponibilité », dans la limite autorisée par la loi.`;

const publicCorrections = {
    'dashboard.page.kicker': 'Accueil',
    'dashboard.page.title': 'Accueil',
    'dashboard.header.title_ready': 'Inventaire du foyer de {{name}}',
    'dashboard.header.title_empty': 'Commencez votre inventaire du foyer',
    'dashboard.header.summary_ready': '{{count}} articles sont déjà suivis dans {{rooms}} pièces. Recherchez dans la liste, ajoutez le prochain article ou gardez les dossiers privés séparés.',
    'dashboard.header.summary_ready_no_rooms': '{{count}} articles sont déjà suivis. Ajoutez des pièces pour garder les emplacements clairs et faciliter la recherche.',
    'dashboard.header.summary_empty': 'Ajoutez le premier article pour débloquer la recherche, l’historique des pièces et un suivi du foyer plus clair.',
    'dashboard.search_panel.title': 'Recherche dans l’inventaire',
    'dashboard.search_panel.description': 'Trouvez un article, une pièce, un emplacement ou un code-barres depuis un seul endroit.',
    'dashboard.search_panel.placeholder': 'Rechercher un article, une pièce, un emplacement ou un code-barres',
    'dashboard.actions_panel.description': 'Créez un nouvel article ou déplacez des enregistrements sensibles vers Personal Vault.',
    'dashboard.content.description_empty': 'Cette zone devient votre fil d’activité récente dès que le premier article est ajouté.',
    'dashboard.content.empty_title': 'Aucun ajout récent pour le moment',
    'dashboard.content.empty_description': 'Cette liste se remplit dès que vous ajoutez le premier article. Commencez par quelque chose de facile à reconnaître plus tard, puis les pièces et les catégories resteront exactes dès le premier jour.',
    'dashboard.content.empty_tip_one_title': 'Commencez avec un objet ménager visible',
    'dashboard.content.empty_tip_one_body': 'Choisissez quelque chose que vous reconnaîtrez instantanément plus tard, comme un appareil, une boîte de rangement ou un petit outil.',
    'dashboard.content.empty_tip_two_title': 'Attribuez une vraie pièce',
    'dashboard.content.empty_tip_two_body': 'Les comptes de pièces et de catégories ne restent exacts que lorsque les nouveaux objets leur sont attribués à la création.',
    'dashboard.content.empty_tip_three_title': 'Gardez les secrets hors du flux partagé',
    'dashboard.content.empty_tip_three_body': 'Utilisez Personal Vault pour les clés, les codes, les actes ou tout ce qui ne doit pas apparaître dans l’historique de l’inventaire du foyer.',
    'dashboard.content.added_on': 'Ajouté {{date}}',
    'dashboard.visibility.public': 'Partagé',
    'dashboard.visibility.private': 'Privé',
    'dashboard.empty_state.secondary_cta': 'Ouvrir le coffre-fort personnel',
    'dashboard.empty_state.step_two_title': 'Placez-le dans une pièce',
    'dashboard.empty_state.step_two_body': 'Définissez la pièce et la quantité afin que la recherche et les statistiques deviennent immédiatement utiles.',
    'beta_banner.aria_label': 'Avis bêta. Les fonctionnalités d’accès anticipé peuvent encore changer.',
    'settings.control_sections.about': 'À propos',
    'settings.workspace_section.eyebrow': 'Compte et maisons',
    'settings.workspace_section.title': 'Accès au compte et au foyer',
    'settings.workspace_section.description': 'Gérez votre profil, votre maison active et l’accès des membres depuis une zone de contrôle.',
    'settings.account_overview.title': 'Aperçu du compte',
    'settings.account_overview.description': 'Détails de base du profil du compte connecté.',
    'settings.security_section.eyebrow': 'Sécurité et préférences',
    'settings.security_section.title': 'Protection et préférences',
    'settings.security_section.description': 'Contrôlez la connexion, la récupération du compte, les appareils de confiance et l’apparence sans passer par des panneaux séparés.',
    'settings.preferences_section.title': 'Apparence et langue',
    'settings.preferences_section.description': 'Gardez l’espace de travail confortable sur cet appareil et définissez la langue utilisée pour la navigation et les textes juridiques.',
    'settings.data_section.eyebrow': 'Données et à propos',
    'settings.data_section.title': 'Données, juridique et propriété du compte',
    'settings.data_section.description': 'Séparez clairement les exports, les informations produit et les actions de compte irréversibles.',
    'settings.about.version': 'Version',
    'settings.about.beta_title': 'Statut bêta',
    'settings.about.beta_body': '{{brandName}} est encore en phase bêta. Les fonctionnalités peuvent évoluer, les workflows peuvent changer, et les données importantes du foyer doivent toujours être sauvegardées.',
    'settings.theme.description': 'Choisissez l’apparence de l’espace de travail sur cet appareil.',
    'settings.theme.light_aria': 'Passer au thème clair',
    'settings.theme.dark_aria': 'Passer au thème sombre',
    'settings.language_description': 'Appliquez une langue à la navigation, aux libellés, aux textes juridiques et au formatage des dates.',
    'settings.language_updated_body': '{{language}} est maintenant actif. Un rechargement n’est nécessaire que si un autre onglet ouvert affiche encore un ancien texte.',
    'settings.select_language_tooltip': 'Changer la langue. Actuelle : {{language}}',
    'settings.select_language_aria': 'Sélectionner la langue. Actuelle : {{language}}',
    'settings.frequently_used': 'Fréquemment utilisées',
    'settings.other_languages': 'Toutes les langues',
    'settings.no_language_found': 'Aucune langue ne correspond à cette recherche.',
    'settings.two_factor.description': 'Ajoutez une couche de sécurité supplémentaire à votre compte avec l’authentification à deux facteurs basée sur TOTP',
    'settings.two_factor.enable': 'Activer la 2FA',
    'settings.two_factor.disable': 'Désactiver la 2FA',
    'settings.two_factor.disable_desc': 'Supprimer l’authentification à deux facteurs de votre compte',
    'settings.two_factor.disable_title': 'Désactiver l’authentification à deux facteurs',
    'settings.two_factor.disable_confirm': 'Désactiver la 2FA',
    'settings.two_factor.disabled_success': 'L’authentification à deux facteurs a été désactivée',
    'settings.two_factor.password_placeholder': 'Saisissez votre mot de passe',
    'settings.two_factor.method_totp': 'Authentificateur',
    'settings.two_factor.method_backup': 'Code de secours',
    'settings.two_factor.method_recovery': 'Clé de récupération',
    'settings.two_factor.totp_code_label': 'Code de l’authentificateur',
    'settings.two_factor.backup_code_label': 'Code de secours',
    'settings.two_factor.recovery_key_label': 'Clé de récupération',
    'settings.two_factor.cancel': 'Annuler',
    'settings.two_factor.setup_title': 'Configurer la 2FA',
    'settings.two_factor.step_1': 'Étape 1 : scanner le code QR',
    'settings.two_factor.step_2': 'Étape 2 : vérifier le code',
    'settings.two_factor.step_3': 'Étape 3 : enregistrer les codes de secours',
    'settings.two_factor.scan_instruction': 'Scannez ce code QR avec votre application d’authentification (Google Authenticator, Authy ou toute application TOTP)',
    'settings.two_factor.manual_entry': 'Vous ne pouvez pas scanner ? Saisissez cette clé manuellement :',
    'settings.two_factor.copy_secret': 'Copier le secret',
    'settings.two_factor.next': 'Suivant',
    'settings.two_factor.verify_instruction': 'Saisissez le code à 6 chiffres affiché dans votre application d’authentification pour vérifier la configuration',
    'settings.two_factor.verify_error': 'La vérification a échoué',
    'settings.two_factor.code_label': 'Code à 6 chiffres',
    'settings.two_factor.back': 'Retour',
    'settings.two_factor.activate': 'Activer la 2FA',
    'settings.two_factor.backup_warning_title': 'Enregistrez ces codes de secours !',
    'settings.two_factor.backup_warning_text': 'Si vous perdez l’accès à votre application d’authentification, vous pouvez utiliser ces codes pour vous connecter. Chaque code ne peut être utilisé qu’une seule fois. Conservez-les en lieu sûr.',
    'settings.two_factor.download_codes': 'Télécharger les codes de secours',
    'settings.two_factor.backup_acknowledge': 'J’ai enregistré mes codes de secours dans un endroit sûr',
    'settings.two_factor.done': 'Terminé',
    'settings.two_factor.regenerate_codes': 'Régénérer les codes de secours',
    'settings.two_factor.regenerate_codes_desc': 'Générer de nouveaux codes de secours (les anciens seront invalidés)',
    'settings.two_factor.regenerate': 'Régénérer',
    'settings.two_factor.codes_regenerated': 'Les codes de secours ont été régénérés',
    'settings.two_factor.codes_error': 'Échec de la régénération des codes de secours',
    'settings.two_factor.close_codes': 'Fermer',
    'settings.two_factor.revoke_devices': 'Révoquer les appareils de confiance',
    'settings.two_factor.revoke_devices_desc': 'Supprimer tous les appareils mémorisés, ce qui exigera la 2FA à la prochaine connexion',
    'settings.two_factor.devices_revoked': '{{count}} appareil(s) de confiance supprimé(s)',
    'settings.two_factor.devices_error': 'Échec de la révocation des appareils',
    'settings.theme.title': 'Thème',
    'settings.theme.dark': 'Mode sombre',
    'settings.theme.light': 'Mode clair',
    'settings.about.legal_title': 'Documents légaux',
    'settings.about.legal_description': 'Vous pouvez rouvrir les conditions et les textes de confidentialité depuis cet écran après les avoir acceptés.',
    'settings.about.terms_link': 'Conditions d’utilisation',
    'settings.about.privacy_link': 'Politique de confidentialité',
    'layout.expand_sidebar': 'Développer la barre latérale',
    'layout.account_menu_tooltip': 'Menu du compte {{name}}',
    'qr.actions_desc': 'Copiez le lien direct de l’article ou enregistrez un code QR net pour l’impression.',
    'qr.download_success_title': 'Code QR téléchargé',
    'qr.download_success_body': 'L’image du code QR a été enregistrée avec un nom de fichier convivial.',
    'qr.privacy_summary': 'Les détails du réseau restent cachés jusqu’à ce que vous ayez besoin de conseils.',
    'qr.privacy_title': 'Notes de confidentialité',
    'qr.link_privacy_note': 'L’adresse réseau reste masquée ici. Scannez le code ou copiez le lien uniquement lorsque vous souhaitez partager volontairement l’accès direct à l’article sur votre installation locale.',
    'admin.users.ban_warning': 'Cette action bloque immédiatement l’accès de l’utilisateur jusqu’à ce qu’un administrateur le rétablisse.',
    'admin.users.unban_title': 'Rétablir l’accès de cet utilisateur ?',
    'admin.users.unban_description': 'Le rétablissement de l’accès permet à cet utilisateur de se reconnecter.',
    'admin.users.unban_warning': 'L’utilisateur récupère l’accès lors de la prochaine connexion réussie.',
    'admin.users.delete_title': 'Supprimer ce compte ?',
    'admin.users.delete_description': 'La suppression de {{username}} supprime définitivement le compte et les données d’inventaire qu’il possède.',
    'admin.users.delete_warning': 'Cette action est irréversible et supprime les pièces, catégories, articles et l’historique de propriété liés à ce compte.',
    'admin.users.ban_success_title': 'Utilisateur banni',
    'admin.users.ban_success_body': 'La connexion de {{username}} a été bloquée.'
};

const rootCorrections = {
    'admin.logs.audit.user_deleted': 'Utilisateur supprimé : {{username}} | Ménages supprimés : {{deletedHouses}} | Propriétés transférées : {{transferredOwnerships}} | Destinataire : {{recipient}} | Sujet : {{subject}}',
    'admin.email.notes_body_with_rate_limit': 'Utilisez ceci pour l’assistance opérationnelle ou pour les communications liées au compte. Les contenus sensibles doivent rester dans l’application autant que possible. Limite d’envoi actuelle : {{rateLimit}}.'
};

const baseDir = process.cwd();

applyCorrections(path.join(baseDir, 'client', 'public', 'locales', 'fr', 'translation.json'), {
    ...publicCorrections,
    'legal.privacy_policy_content': privacyPolicyContent,
    'legal.terms_of_service_content': termsOfServiceContent,
    'legal.document_badge': 'Document juridique',
    'legal.data_privacy_badge': 'Données et confidentialité',
    'legal.back_to_home': 'Retour à l’accueil',
    'legal.quick_access': 'Accès rapide',
    'legal.on_this_page': 'Sur cette page',
    'legal.contents': 'Sommaire',
    'legal.page_label': 'Page',
    'legal.overview': 'Vue d’ensemble',
    'legal.contact': 'Contact',
    'legal.jump_to': 'Aller à',
    'legal.privacy_description': 'L’avis de confidentialité de cette installation de {{brandName}} explique quelles données sont traitées, comment elles sont collectées, comment elles sont partagées ou transférées, et quels droits et voies de réclamation peuvent s’appliquer.',
    'legal.privacy_support_label': 'Pour les demandes liées à la confidentialité, aux droits et aux réclamations concernant cette installation :',
    'legal.privacy_summary.title': 'En pratique',
    'legal.privacy_summary.description': 'Ce bref résumé vous aide à voir l’essentiel en premier.',
    'legal.privacy_summary.items.what': '**Ce que nous traitons :** Nous traitons les données de compte, de service, de sécurité technique et les données facultatives des fournisseurs nécessaires pour faire fonctionner votre compte et l’application.',
    'legal.privacy_summary.items.why': '**Pourquoi :** Les données sont utilisées pour l’authentification, la sécurité des sessions, les workflows d’inventaire, les sauvegardes et les fonctions du Coffre-fort personnel.',
    'legal.privacy_summary.items.sharing': '**Partage et stockage :** Nous ne vendons pas les données personnelles. Elles sont conservées sur l’infrastructure choisie pour cette installation ; si vous choisissez Google Sign-In ou la recherche par code-barres, des données limitées sont partagées avec le fournisseur sélectionné pour terminer cette fonctionnalité, et l’opérateur doit indiquer les pays et garanties requis.',
    'legal.privacy_summary.shortcuts.what': 'Ce que nous traitons',
    'legal.privacy_summary.shortcuts.why': 'Pourquoi',
    'legal.privacy_summary.shortcuts.sharing': 'Partage et stockage',
    'legal.privacy_summary.shortcuts.rights': 'Droits',
    'legal.privacy_summary.section_titles.what': 'Quelles données nous collectons et traitons',
    'legal.privacy_summary.section_titles.why': 'Pourquoi nous les traitons',
    'legal.privacy_summary.section_titles.sharing': 'Stockage et transfert',
    'legal.privacy_summary.section_titles.rights': 'Vos droits',
    'legal.terms_description': 'Résumé rapide',
    'legal.terms_support_label': 'Pour toute question sur les conditions applicables à cette installation :',
    'legal.terms_summary.eyebrow': 'Résumé rapide',
    'legal.terms_summary.title': 'Ce que cela signifie en pratique',
    'legal.terms_summary.items.use': 'Utilisez le service uniquement pour les données que vous êtes autorisé à téléverser, stocker ou partager.',
    'legal.terms_summary.items.responsibility': 'Vous restez responsable de la légalité, de l’exactitude et de la propriété de ce que vous téléversez ou partagez.',
    'legal.terms_summary.items.security': 'Conservez votre mot de passe, vos supports de récupération et vos sauvegardes en lieu sûr.',
    'legal.terms_summary.items.backups': 'La suppression du compte est définitive, conservez donc vos propres sauvegardes des informations importantes.',
    'legal.terms_summary.items.disclaimer': 'La disponibilité, l’assistance et les intégrations dépendent de l’opérateur de cette installation ; le service est fourni « tel quel » et « selon disponibilité », dans la limite autorisée par la loi.'
});

applyCorrections(path.join(baseDir, 'locales', 'fr.json'), rootCorrections);

console.log('French translation repair completed.');
