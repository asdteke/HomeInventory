import fs from 'fs';
import path from 'path';

const PUBLIC_LOCALES_DIR = 'client/public/locales';

const MANUAL_LEGAL = {
    'ru': {
        'privacy': `## Обзор
**{{brandName}}** является программным обеспечением с открытым исходным кодом. Для данной установки контроллером данных или оператором услуг является **{{controllerName}}**.
- **Адрес контроллера:** {{controllerAddress}}
- **Контакт по вопросам конфиденциальности:** {{privacyEmail}}
- **Общая поддержка:** {{supportEmail}}

Это уведомление объясняет, **какие персональные данные обрабатываются**, **как они получаются**, **почему они обрабатываются**, **кто может их получать**, **как долго они хранятся** и **какие права у вас есть**.

## Какие данные мы собираем и обрабатываем
- **Данные учетной записи:** имя пользователя, адрес электронной почты, хэш пароля, сеансовые файлы cookie, данные доверенных устройств и журналы безопасности.
- **Данные службы:** дома, комнаты, категории, предметы, загруженные медиафайлы, запросы на выдачу и записи личного хранилища, которые вы создаете.
- **Технические данные:** IP-адрес, идентификаторы браузера/сеанса и данные о языковых предпочтениях.

## Почему мы их обрабатываем
- **Работа учетной записи:** для создания и управления вашей учетной записью.
- **Аутентификация и безопасность:** для подтверждения вашей личности и защиты сеансов.
- **Основные функции:** для обеспечения инвентаризации, резервного копирования и функций Личного хранилища.`,
        'terms': `1. Используя **{{brandName}}**, вы соглашаетесь с этими условиями.
2. Услуга предоставляется «как есть» и «по мере доступности» без каких-либо гарантий.
3. Вы несете ответственность за законность, точность и право собственности на то, что вы загружаете.
4. Храните свой пароль и материалы для восстановления в безопасности.
5. Мы оставляем за собой право приостанавливать или удалять учетные записи, нарушающие эти правила.`
    },
    'nl': {
        'privacy': `## Overzicht
**{{brandName}}** is open-source software. Voor deze installatie is de verwerkingsverantwoordelijke of serviceprovider **{{controllerName}}**.
- **Adres:** {{controllerAddress}}
- **Privacy contact:** {{privacyEmail}}
- **Support contact:** {{supportEmail}}

Deze kennisgeving legt uit **welke persoonlijke gegevens worden verwerkt**, **hoe ze worden verkregen**, **waarom ze worden verwerkt**, **wie ze kan ontvangen**, **hoe lang ze worden bewaard** en **welke rechten u heeft**.

## Welke gegevens we verzamelen en verwerken
- **Accountgegevens:** gebruikersnaam, e-mailadres, wachtwoord-hash, sessiecookies, vertrouwde apparaatgegevens en beveiligingslogs.
- **Servicedata:** huizen, kamers, categorieën, items, geüploade media en persoonlijke kluisrecords die u aanmaakt.
- **Technische gegevens:** IP-adres, browser/sessie-identificaties en taalvoorkeuren.

## Waarom we ze verwerken
- **Accountbeheer:** om uw account aan te maken en te beheren.
- **Authenticatie en beveiliging:** om uw identiteit te verifiëren en sessies te beveiligen.
- **Kernfuncties:** om inventarisatie-, back-up- en Personal Vault-functies te bieden.`,
        'terms': `1. Door **{{brandName}}** te gebruiken, gaat u akkoord met deze voorwaarden.
2. De dienst wordt geleverd "zoals deze is" zonder enige garanties.
3. U blijft verantwoordelijk voor de legaliteit en eigendom van wat u uploadt.
4. Bewaar uw wachtwoord en herstelmaterialen veilig.
5. Wij behouden ons het recht voor om accounts die dit beleid schenden te schorsen of te verwijderen.`
    },
    'pt': {
        'privacy': `## Visão Geral
O **{{brandName}}** é um software de código aberto. Para esta instalação, o controlador de dados ou operador de serviço é **{{controllerName}}**.
- **Endereço do controlador:** {{controllerAddress}}
- **Contato de privacidade:** {{privacyEmail}}
- **Suporte geral:** {{supportEmail}}

Este aviso explica **quais dados pessoais são processados**, **como são obtidos**, **por que são processados**, **quem pode recebê-los**, **por quanto tempo são mantidos** e **quais direitos você possui**.

## Quais dados coletamos e processamos
- **Dados da conta:** nome de usuário, endereço de e-mail, hash de senha, cookies de sessão, dados de dispositivos confiáveis e logs de segurança.
- **Dados do serviço:** casas, cômodos, categorias, itens, mídias enviadas e registros do cofre pessoal que você criar.
- **Dados técnicos:** endereço IP, identificadores de navegador/sessão e dados de preferência de idioma.

## Por que os processamos
- **Operação da conta:** para criar e gerir a sua conta.
- **Autenticação e segurança:** para verificar a sua identidade e proteger as sessões.
- **Recursos principais:** para fornecer funções de inventário, backup e Cofre Pessoal.`,
        'terms': `1. Ao usar o **{{brandName}}**, você concorda com estes termos.
2. O serviço é fornecido "como está" sem garantias de qualquer tipo.
3. Você permanece responsável pela legalidade e propriedade do que enviar.
4. Mantenha sua senha e materiais de recuperação em segurança.
5. Reservamo-nos o direito de suspender ou excluir contas que violem estas políticas.`
    },
    'it': {
        'privacy': `## Panoramica
**{{brandName}}** è un software open source. Per questa installazione, il titolare del trattamento o l'operatore del servizio è **{{controllerName}}**.
- **Indirizzo:** {{controllerAddress}}
- **Contatto privacy:** {{privacyEmail}}
- **Supporto generale:** {{supportEmail}}

Informativa su **quali dati personali vengono elaborati**, **come vengono ottenuti**, **perché vengono elaborati**, **chi può riceverli**, **per quanto tempo vengono conservati** e **quali diritti hai**.

## Quali dati raccogliamo ed elaboriamo
- **Dati dell'account:** nome utente, indirizzo e-mail, hash della password, cookie di sessione, dati del dispositivo affidabile e log di sicurezza.
- **Dati del servizio:** case, stanze, categorie, articoli, media caricati e record del caveau personale creati.
- **Dati tecnici:** indirizzo IP, identificatori del browser/sessione e preferenze della lingua.

## Perché li elaboriamo
- **Funzionamento dell'account:** per creare e gestire il tuo account.
- **Autenticazione e sicurezza:** per verificare la tua identità e proteggere le sessioni.
- **Funzioni principali:** per fornire funzioni di inventario, backup e Personal Vault.`,
        'terms': `1. Utilizzando **{{brandName}}**, accetti questi termini.
2. Il servizio è fornito "così com'è" senza garanzie.
3. Rimani responsabile della legalità e della proprietà di ciò che carichi.
4. Mantieni la tua password e i materiali di recupero al sicuro.
5. Ci riserviamo il diritto di sospendere o eliminare gli account che violano queste policy.`
    },
    'pl': {
        'privacy': `## Przegląd
**{{brandName}}** to oprogramowanie typu open-source. W przypadku tej instalacji administratorem danych lub operatorem usługi jest **{{controllerName}}**.
- **Adres administratora:** {{controllerAddress}}
- **Kontakt w sprawie prywatności:** {{privacyEmail}}
- **Wsparcie ogólne:** {{supportEmail}}

Niniejsze powiadomienie wyjaśnia, **jakie dane osobowe są przetwarzane**, **jak są pozyskiwane**, **dlaczego są przetwarzane**, **kto może je otrzymywać**, **jak długo są przechowywane** i **jakie masz prawa**.

## Jakie dane zbieramy i przetwarzamy
- **Dane konta:** nazwa użytkownika, adres e-mail, skrót hasła, pliki cookie sesji, dane zaufanych urządzeń i dzienniki bezpieczeństwa.
- **Dane usługi:** domy, pokoje, kategorie, przedmioty, przesłane multimedia i rekordy osobistego sejfu, które tworzysz.
- **Dane techniczne:** adres IP, identyfikatory przeglądarki/sesji oraz dane dotyczące preferencji językowych.

## Dlaczego je przetwarzamy
- **Obsługa konta:** w celu utworzenia i zarządzania kontem.
- **Uwierzytelnianie i bezpieczeństwo:** w celu weryfikacji tożsamości i zabezpieczenia sesji.
- **Główne funkcje:** w celu zapewnienia funkcji inwentaryzacji, kopii zapasowych i Osobistego Sejfu.`,
        'terms': `1. Korzystając z **{{brandName}}**, akceptujesz niniejsze warunki.
2. Usługa jest świadczona w stanie "takim, jakim jest", bez żadnych gwarancji.
3. Ponosisz odpowiedzialność za legalność i własność przesyłanych treści.
4. Dbaj o bezpieczeństwo swojego hasła i materiałów do odzyskiwania danych.
5. Zastrzegamy sobie prawo do zawieszenia lub usunięcia kont naruszających te zasady.`
    }
};

async function main() {
    for (const [lang, trans] of Object.entries(MANUAL_LEGAL)) {
        const filePath = path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json');
        if (!fs.existsSync(filePath)) continue;

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        content.legal.privacy_policy_content = trans.privacy;
        content.legal.terms_of_service_content = trans.terms;

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        console.log(`Manually injected 1:1 legal for ${lang}`);
    }
}

main();
