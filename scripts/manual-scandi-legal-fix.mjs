import fs from 'fs';
import path from 'path';

const PUBLIC_LOCALES_DIR = 'client/public/locales';

const MANUAL_LEGAL = {
    'sv': {
        'privacy': `## Översikt
**{{brandName}}** är programvara med öppen källkod. För denna installation är personuppgiftsansvarig eller tjänsteleverantör **{{controllerName}}**.
- **Adress:** {{controllerAddress}}
- **Privatlivskontakt:** {{privacyEmail}}
- **Supportkontakt:** {{supportEmail}}

Detta meddelande förklarar **vilka personuppgifter som behandlas**, **hur de erhålls**, **varför de behandlas**, **vem som kan ta emot dem**, **hur länge de sparas** och **vilka rättigheter du har**.

## Vilka uppgifter vi samlar in och behandlar
- **Kontouppgifter:** användarnamn, e-postadress, lösenordshash, sessionscookies, betrodda enhetsdata och säkerhetsloggar.
- **Tjänstedata:** hus, rum, kategorier, föremål, uppladdade medier och personliga valvposter som du skapar.
- **Tekniska data:** IP-adress, webbläsar-/sessionsidentifierare och språkinställningar.

## Varför vi behandlar dem
- **Kontodrift:** för att skapa och hantera ditt konto.
- **Autentisering och säkerhet:** för att verifiera din identitet och säkra sessioner.
- **Kärnfunktioner:** för att tillhandahålla inventerings-, backup- och Personal Vault-funktioner.`,
        'terms': `1. Genom att använda **{{brandName}}** godkänner du dessa villkor.
2. Tjänsten tillhandahålls "i befintligt skick" utan garantier.
3. Du förblir ansvarig för lagligheten och ägandet av det du laddar upp.
4. Håll ditt lösenord och återställningsmaterial säkert.
5. Vi förbehåller oss rätten att stänga av eller ta bort konton som bryter mot dessa policyer.`
    },
    'da': {
        'privacy': `## Oversigt
**{{brandName}}** er open source-software. For denne installation er den dataansvarlige eller tjenesteudbyder **{{controllerName}}**.
- **Adresse:** {{controllerAddress}}
- **Privatlivskontakt:** {{privacyEmail}}
- **Supportkontakt:** {{supportEmail}}

Denne meddelelse forklarer, **hvilke personoplysninger der behandles**, **hvordan de indsamles**, **hvorfor de behandles**, **hvem der kan modtage dem**, **hvorfor de opbevares**, og **hvilke rettigheder du har**.

## Hvilke data vi indsamler og behandler
- **Kontooplysninger:** brugernavn, e-mailadresse, adgangskode-hash, sessionscookies, data om de enheder, du stoler på, og sikkerhedslogfiler.
- **Tjenestedata:** huse, rum, kategorier, genstande, uploadede medier og de personlige boksregistreringer, du opretter.
- **Tekniske data:** IP-adresse, browser-/sessionsidentifikatorer og sprogpræferencer.

## Hvorfor vi behandler dem
- **Kontodrift:** for at oprette og administrere din konto.
- **Autentificering og sikkerhed:** for at bekræfte din identitet og sikre sessioner.
- **Kernefunktioner:** for at levere lager-, backup- og Personal Vault-funktioner.`,
        'terms': `1. Ved at bruge **{{brandName}}** accepterer du disse vilkår.
2. Tjenesten leveres "som den er" uden garantier.
3. Du er ansvarlig for lovligheden og ejerskabet af det, du uploader.
4. Hold din adgangskode og genoprettelsesmaterialer sikre.
5. Vi forbeholder os retten til at suspendere eller slette konti, der overtræder disse politikker.`
    },
    'no': {
        'privacy': `## Oversikt
**{{brandName}}** er programvare med åpen kildekode. For denne installasjonen er behandlingsansvarlig eller tjenesteleverandør **{{controllerName}}**.
- **Adresse:** {{controllerAddress}}
- **Personvernkontakt:** {{privacyEmail}}
- **Kundestøtte:** {{supportEmail}}

Denne meldingen forklarer **hvilke personopplysninger som behandles**, **hvordan de hentes inn**, **hvorfor de behandles**, **hvem som kan motta dem**, **hvor lenge de lagres**, og **hvilke rettigheter du har**.

## Hvilke data vi samler inn og behandler
- **Kontoopplysninger:** brukernavn, e-postadresse, passord-hash, informasjonskapsler for økter, pålitelige enhetsdata og sikkerhetslogger.
- **Tjenestedata:** hus, rom, kategorier, gjenstander, opplastede medier og personlige hvelvposter du oppretter.
- **Tekniske data:** IP-adresse, nettleser-/øktidentifikatorer og språkpreferanser.

## Hvorfor vi behandler dem
- **Kontodrift:** for å opprette og administrere kontoen din.
- **Autentisering og sikkerhet:** for å verifisere identiteten din og sikre økter.
- **Kjernefunksjoner:** for å tilby inventar-, sikkerhetskopierings- og Personal Vault-funksjoner.`,
        'terms': `1. Ved å bruke **{{brandName}}** godtar du disse vilkårene.
2. Tjenesten leveres "som den er" uten garantier.
3. Du er ansvarlig for lovligheten og eierskapet til det du laster opp.
4. Hold passordet og gjenopprettingsmaterialet ditt trygt.
5. Vi forbeholder oss retten til å suspendere eller slette kontoer som bryter med disse retningslinjene.`
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
