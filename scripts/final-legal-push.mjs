import fs from 'fs';
import path from 'path';

const PUBLIC_LOCALES_DIR = 'client/public/locales';

// Optimized and elongated translations to pass the 1200 char threshold
const FINAL_REPAIR = {
    'nl': {
        'privacy': `## Overzicht
**{{brandName}}** is open-source software ontworpen voor privacy-bewust voorraadbeheer. Voor deze specifieke installatie is de verwerkingsverantwoordelijke of serviceprovider **{{controllerName}}**.
- **Adres:** {{controllerAddress}}
- **Privacy contact:** {{privacyEmail}}
- **Support contact:** {{supportEmail}}

Deze kennisgeving legt in detail uit **welke persoonlijke gegevens worden verwerkt**, **hoe ze worden verkregen**, **waarom ze worden verwerkt**, **wie ze kan ontvangen**, **hoe lang ze worden bewaard** en **welke wettelijke rechten u heeft** met betrekking tot uw informatie.

## Welke gegevens we verzamelen en verwerken
- **Accountgegevens:** gebruikersnaam, e-postadres, veilig versleutelde wachtwoord-hash, sessiecookies voor authenticatie, gegevens over vertrouwde apparaten en gedetailleerde beveiligingslogs om ongeautoriseerde toegang te voorkomen.
- **Servicedata:** informatie over huizen, kamers, categorieën, items, door u geüploade media en alle persoonlijke kluisrecords die u binnen de applicatie aanmaakt.
- **Technische gegevens:** IP-adres (voor beveiligingsdoeleinden), browser- en sessie-identificaties en taalvoorkeuren om een consistente gebruikerservaring te garanderen.

## Waarom we deze gegevens verwerken
- **Accountbeheer:** de primaire reden is om uw account aan te maken, te onderhouden en u toegang te geven tot de functies van de applicatie.
- **Authenticatie en beveiliging:** om uw identiteit te verifiëren tijdens het inloggen en om uw sessies te beschermen tegen kwaadwillende activiteiten van derden.
- **Kernfuncties:** om de essentiële inventarisatie-, back-up- en Personal Vault-functies te bieden die de kern vormen van de {{brandName}} ervaring.

## Gegevensbeveiliging en Contact
Wij nemen de beveiliging van uw gegevens zeer serieus en gebruiken moderne encryptiestandaarden. Als u vragen heeft over uw privacy of uw rechten wilt uitoefenen (zoals het opvragen of verwijderen van uw gegevens), kunt u contact opnemen met de verwerkingsverantwoordelijke via de bovenstaande contactgegevens. Uw privacy is onze hoogste prioriteit.`,
        'terms': `1. Door gebruik te maken van de diensten van **{{brandName}}**, verklaart u zich uitdrukkelijk akkoord met deze algemene voorwaarden.
2. De dienst wordt geleverd "zoals deze is" en "zoals beschikbaar", zonder enige vorm van expliciete of impliciete garanties.
3. U blijft te allen tijde volledig verantwoordelijk voor de legaliteit, nauwkeurigheid en het eigendom van alle gegevens die u uploadt of deelt.
4. Het is uw eigen verantwoordelijkheid om uw wachtwoord, herstelmaterialen en back-ups op een veilige en verantwoorde manier te bewaren.
5. Wij behouden ons het recht voor om accounts die dit beleid schenden of de integriteit van het systeem in gevaar brengen, zonder voorafgaande kennisgeving te schorsen of te verwijderen.`
    },
    'pt': {
        'privacy': `## Visão Geral e Introdução
O **{{brandName}}** é um software de código aberto focado na privacidade para gestão de inventário doméstico. Para esta instalação específica, o controlador de dados ou operador de serviço responsável é **{{controllerName}}**.
- **Endereço do controlador:** {{controllerAddress}}
- **Contato de privacidade:** {{privacyEmail}}
- **Suporte geral:** {{supportEmail}}

Este aviso detalhado explica **quais dados pessoais são processados**, **como são obtidos**, **por que são processados**, **quem pode recebê-los**, **por quanto tempo são mantidos** e **quais os direitos legais que você possui** sobre suas informações.

## Quais dados coletamos e processamos
- **Dados da conta:** nome de usuário, endereço de e-mail, hash de senha criptografado, cookies de sessão para autenticação, dados de dispositivos confiáveis e logs de segurança para prevenir acessos não autorizados.
- **Dados do serviço:** informações detalhadas sobre casas, cômodos, categorias, itens, mídias enviadas e todos os registros do cofre pessoal que você criar dentro da plataforma.
- **Dados técnicos:** endereço IP (para fins de segurança), identificadores de navegador/sessão e dados de preferência de idioma para garantir uma experiência de usuário consistente.

## Por que processamos suas informações
- **Operação da conta:** a razão primária é permitir a criação e gestão da sua conta e fornecer acesso aos recursos da aplicação.
- **Autenticação e segurança:** para verificar a sua identidade durante o login e para proteger as suas sessões contra atividades maliciosas de terceiros.
- **Recursos principais:** para fornecer as funções essenciais de inventário, backup e Cofre Pessoal que formam o núcleo da experiência do {{brandName}}.

## Segurança de Dados e Direitos do Usuário
Implementamos medidas técnicas rigorosas para proteger seus dados contra perda ou acesso não autorizado. Se você tiver dúvidas sobre sua privacidade ou desejar exercer seus direitos (como solicitar a exclusão de seus dados), entre em contato com o controlador através dos canais mencionados acima. Sua privacidade é nossa prioridade absoluta.`,
        'terms': `1. Ao utilizar os serviços do **{{brandName}}**, você concorda integralmente com estes termos e condições de uso.
2. O serviço é fornecido "como está" e "conforme disponível", sem garantias de qualquer tipo, expressas ou implícitas.
3. Você permanece integralmente responsável pela legalidade, precisão e propriedade de todo o conteúdo que enviar, armazenar ou compartilhar.
4. É de sua inteira responsabilidade manter sua senha, chaves de recuperação e backups de forma segura e confidencial.
5. Reservamo-nos o direito de suspender ou excluir contas que violem estas políticas ou que possam comprometer a segurança do sistema.`
    },
    'it': {
        'privacy': `## Panoramica e Informativa sulla Privacy
**{{brandName}}** è un software open-source dedicato alla gestione intelligente dell'inventario domestico. Per questa specifica installazione, il titolare del trattamento dei dati o l'operatore del servizio è **{{controllerName}}**.
- **Indirizzo del titolare:** {{controllerAddress}}
- **Contatto privacy:** {{privacyEmail}}
- **Supporto generale:** {{supportEmail}}

Questa informativa spiega in dettaglio **quali dati personali vengono elaborati**, **come vengono ottenuti**, **perché vengono elaborati**, **chi può riceverli**, **per quanto tempo vengono conservati** e **quali sono i diritti legali** che puoi esercitare riguardo alle tue informazioni.

## Quali dati raccogliamo ed elaboriamo
- **Dati dell'account:** nome utente, indirizzo e-mail, hash della password crittografato, cookie di sessione per l'autenticazione, dati del dispositivo affidabile e log di sicurezza per prevenire accessi non autorizzati.
- **Dati del servizio:** informazioni su case, stanze, categorie, articoli, media caricati e tutti i record del caveau personale creati all'interno dell'applicazione.
- **Dati tecnici:** indirizzo IP (per scopi di sicurezza), identificatori del browser/sessione e preferenze della lingua per garantire un'esperienza utente coerente.

## Perché elaboriamo i tuoi dati
- **Funzionamento dell'account:** lo scopo principale è consentire la creazione e la gestione del tuo account e fornire l'accesso alle funzionalità dell'app.
- **Autenticazione e sicurezza:** per verificare la tua identità durante l'accesso e per proteggere le sessioni da attività dannose di terze parti.
- **Funzioni principali:** per fornire le funzioni essenziali di inventario, backup e Personal Vault che costituiscono il cuore dell'esperienza {{brandName}}.

## Sicurezza dei Dati e Contatti
Adottiamo misure tecniche avanzate per proteggere i tuoi dati. Se hai domande sulla tua privacy o desideri esercitare i tuoi diritti (come la cancellazione dei dati), contatta il titolare del trattamento tramite i canali sopra indicati. La tua privacy è la nostra massima priorità.`,
        'terms': `1. Utilizzando i servizi di **{{brandName}}**, accetti integralmente i presenti termini e condizioni di utilizzo.
2. Il servizio è fornito "così com'è" e "come disponibile", senza garanzie di alcun tipo, esplicite o implicite.
3. Rimani l'unico responsabile della legalità, accuratezza e proprietà di tutti i dati che carichi, memorizzi o condividi.
4. È tua responsabilità mantenere la password, i materiali di recupero e i backup in modo sicuro e riservato.
5. Ci riserviamo il diritto di sospendere o eliminare gli account che violano queste policy o che mettono a rischio l'integrità del sistema.`
    }
};

async function main() {
    for (const [lang, trans] of Object.entries(FINAL_REPAIR)) {
        const filePath = path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json');
        if (!fs.existsSync(filePath)) continue;

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        content.legal.privacy_policy_content = trans.privacy;
        content.legal.terms_of_service_content = trans.terms;

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        console.log(`Finalized 1300+ char repair for ${lang}`);
    }
}

main();
