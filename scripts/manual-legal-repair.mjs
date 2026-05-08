import fs from 'fs';
import path from 'path';

const PUBLIC_LOCALES_DIR = 'client/public/locales';

const MANUAL_TRANSLATIONS = {
    'eo': {
        'privacy': `## Superrigardo
**{{brandName}}** estas malfermkoda programaro kaj povas esti disponigita per oficiala aŭ memgastigita instalo. Por ĉi tiu instalo, la reganto de datumoj aŭ servofunkciigisto estas **{{controllerName}}**.
- **Adreso de reganto:** {{controllerAddress}}
- **Privateca kontakto:** {{privacyEmail}}
- **Ĝenerala subtenkontakto:** {{supportEmail}}

Ĉi tiu avizo klarigas **kiujn personajn datumojn oni prilaboras**, **kiel ili estas ricevitaj**, **kial ili estas prilaboritaj**, **kiu povas ricevi ilin**, **kiom longe ili estas konservataj**, kaj **kiujn rajtojn vi povas havi**.

Se ĉi tiu instalo estas funkciigita de tria partio, tiu funkciigisto respondecas pri ajna deploj-specifa reganta identeco, subtenaj devontigoj, transigaj detaloj, retenaj agordoj kaj lokaj leĝaj avizoj kiuj validas.

## Kiujn datumojn ni kolektas kaj prilaboras
- **Kontaj datumoj:** uzantnomo, retpoŝtadreso, pasvorta haŝo, seancaj kuketoj, fidindaj aparatoj kaj sekurecaj protokoloj.
- **Servaj datumoj:** domoj, ĉambroj, kategorioj, eroj, alŝutitaj amaskomunikiloj, pruntpetoj kaj personaj trezorejoj kiujn vi kreas.
- **Teknikaj datumoj:** IP-adreso, retumilo/seancaj identigiloj, kaj lingvaj preferaj datumoj necesaj por lokalizo kaj konta sekureco.

## Kial ni prilaboras ilin
- **Konta funkciado:** por krei kaj funkciigi vian konton.
- **Aŭtentikigo kaj sekureco:** por aŭtentikigi vin kaj sekurigi seancojn kaj dufaktoran aŭtentikigon.
- **Kernaj trajtoj:** por provizi stokregistron, sekurkopion kaj Personal Vault-funkciojn.

## Viaj rajtoj
Depende de la aplikebla leĝo, vi povas peti konfirmon ĉu viaj personaj datumoj estas prilaboritaj, aliron al ili, kaj informojn pri celoj, kategorioj, ricevantoj kaj translokigoj. Vi povas peti korekton, forigon, detruon, limigon aŭ obĵeton, kaj kie aplikeblas datumporteblon.`,
        'terms': `1. Uzante **{{brandName}}**, vi konsentas pri ĉi tiuj kondiĉoj.
2. La servo estas provizita "kiel estas" kaj "kiel disponebla" sen iaj ajn garantioj.
3. Vi restas respondeca pri la laŭleĝeco, precizeco kaj proprieto de tio, kion vi alŝutas aŭ dividas.
4. Konservu vian pasvorton, reakirajn materialojn kaj sekurkopiojn sekure.
5. Ni rezervas la rajton suspendi aŭ forigi kontojn kiuj malobservas ĉi tiujn politikojn aŭ misuzas la sistemon.`
    },
    'la': {
        'privacy': `## Conspectus
**{{brandName}}** programmura fons aperta est et per officialem vel sui-hospitatam institutionem praeberi potest. Pro hac institutione, moderator datorum vel operator servitii est **{{controllerName}}**.
- **Adversa moderatoris:** {{controllerAddress}}
- **Contactus secreti:** {{privacyEmail}}
- **Contactus subsidii generalis:** {{supportEmail}}

Haec notitia explicat **quae data personalia procedantur**, **quomodo obtineantur**, **cur procedantur**, **qui ea recipere possint**, **quamdiu serventur**, et **quae iura habere possis**.

Si haec institutio a tertia parte operatur, ille operator reus est cuiuslibet identitatis moderatoris certae ad instruendum, obligationum subsidii, singularium translationis, occasuum retentionis et notitiarum legalium localium quae applicantur.

## Quae data colligimus et procedimus
- **Data rationis:** nomen usoris, inscriptio electronica, tesserae hash, crustula sessionis, data machinae fidentis et logi securitatis.
- **Data servitii:** domus, cubicula, categoriae, res, media uploaded, petitiones mutui et monumenta personalia quae creas.
- **Data technica:** inscriptio IP, identificatores navigatri/sessionis, et data praelationis linguae necessaria pro localizatione et securitate rationis.

## Cur ea procedamus
- **Operatio rationis:** ad rationem tuam creandam et operandam.
- **Authenticatio et securitas:** ad te authenticandum et sessiones ac authenticationem duorum factorum securandam.
- **Features nucleares:** ad providendum inventarium, tergum et munera Personal Vault.`,
        'terms': `1. Utendo **{{brandName}}**, his condicionibus assentiris.
2. Servitium "ut est" et "ut praesto" sine ullis warantiis praebetur.
3. Reus manes pro legalitate, accuratione et proprietate eorum quae uploadas vel partiris.
4. Tene tesseram tuam, materias recuperationis et terga tuto.
5. Ius reservamus suspendendi vel delendi rationes quae has rationes violant vel systemate abutuntur.`
    },
    'haw': {
        'privacy': `## Nānā Ginea
He polokalamu kumu hāmama ʻo **{{brandName}}** a hiki ke hāʻawi ʻia ma o kahi hoʻonohonoho kūhelu a i ʻole ka hoʻonohonoho ponoʻī. No kēia hoʻonohonoho ʻana, ʻo ka mea hoʻoponopono ʻikepili a i ʻole ka mea hoʻohana lawelawe ʻo **{{controllerName}}**.
- **He helu wahi o ka mea hoʻoponopono:** {{controllerAddress}}
- **Ka leka uila pilikino:** {{privacyEmail}}
- **Ka leka uila kākoʻo:** {{supportEmail}}

E wehewehe ana kēia hoʻolaha **he aha ka ʻikepili pilikino e hana ʻia ana**, **pehea e loaʻa ai**, **no ke aha e hana ʻia ai**, **ʻo wai ka mea hiki ke loaʻa**, **pehea ka lōʻihi o ka mālama ʻia ʻana**, a **he aha nā kuleana i loaʻa iā ʻoe**.

Inā hoʻohana ʻia kēia hoʻonohonoho e kekahi ʻaoʻao ʻekolu, ʻo kēlā mea hoʻohana ke kuleana no kēlā me kēia ʻike mea hoʻoponopono, nā hoʻohiki kākoʻo, nā kikoʻī hoʻoili, nā hoʻonohonoho mālama, a me nā hoʻolaha kānāwai kūloko e pili ana.

## He aha ka ʻikepili a mākou e hōʻiliʻili ai a hana ai
- **ʻIkepili moʻokāki:** inoa inoa, leka uila, huaʻōlelo huna, nā kuki kau, nā ʻikepili hāmeʻa i hilinaʻi ʻia, a me nā moʻolelo palekana.
- **ʻIkepili lawelawe:** nā hale, nā lumi, nā waeʻano, nā mea, nā pāpaho i hoʻouka ʻia, nā noi hōʻaiʻē, a me nā moʻolelo pahu pilikino āu i hana ai.
- **ʻIkepili ʻenehana:** helu wahi IP, nā mea hōʻike polokalamu kele pūnaewele/kau, a me nā ʻikepili koho ʻōlelo e pono ai no ka hoʻonohonoho ʻana a me ka palekana moʻokāki.

## No ke aha mākou e hana ai
- **Ka hana moʻokāki:** e hana a hoʻohana i kāu moʻokāki.
- **Ka hōʻoia a me ka palekana:** e hōʻoia iā ʻoe a e hoʻopaʻa i nā kau a me ka hōʻoia kumu ʻelua.
- **Nā hiʻohiʻona nui:** e hāʻawi i ka papa helu, ke kope mālama, a me nā hana Personal Vault.`,
        'terms': `1. Ma ka hoʻohana ʻana iā **{{brandName}}**, ʻae ʻoe i kēia mau ʻōlelo.
2. Hāʻawi ʻia ka lawelawe "e like me ia" a me "e like me ka mea i loaʻa" me ka ʻole o nā palapala hōʻoia.
3. Ke mau nei kou kuleana no ke kānāwai, ka pololei, a me ka kuleana of kāu mea e hoʻouka ai a kaʻana like paha.
4. E mālama pono i kāu huaʻōlelo huna, nā mea kōkua hoʻōla, a me nā kope mālama.
5. Ke mālama nei mākou i ke kuleana e kāpae a i ʻole e holoi i nā moʻokāki e kūʻē i kēia mau kulekele a i ʻole e hana ʻino i ka ʻōnaehana.`
    },
    'yi': {
        'privacy': `## איבערבליק
**{{brandName}}** איז אָפֿן-קוואַל ווייכווארג און קענען זיין צוגעשטעלט דורך אַן באַאַמטער אָדער זעלבסט-כאָוסטיד ינסטאַלירונג. פֿאַר דעם ינסטאַלירונג, דער דאַטן קאָנטראָללער אָדער דינסט אָפּעראַטאָר איז **{{controllerName}}**.
- **קאָנטראָללער אַדרעס:** {{controllerAddress}}
- **פּריוואַטקייט קאָנטאַקט:** {{privacyEmail}}
- **אַלגעמיינע שטיצן קאָנטאַקט:** {{supportEmail}}

דער באַמערקונג דערקלערט **וואָס פערזענלעכע דאַטן זענען פּראַסעסט**, **ווי זיי זענען באקומען**, **פֿאַר וואָס זיי זענען פּראַסעסט**, **ווער קען זיי באַקומען**, **ווי לאַנג זיי זענען געהאלטן**, און **וואָס רעכט איר קען האָבן**.

אויב דעם ינסטאַלירונג איז אפערירט דורך א דריט פארטיי, דער אָפּעראַטאָר איז פאַראַנטוואָרטלעך פֿאַר קיין ינסטאַלירונג-ספּעציפיש קאָנטראָללער אידענטיטעט, שטיצן קאַמיטמאַנץ, אַריבערפירן דעטאַילס, און היגע לעגאַל באַמערקונגען.

## וואָס דאַטן מיר קלייַבן און פּראָצעס
- **קאָנטאָ דאַטן:** באַניצער נאָמען, בליצפּאָסט אַדרעס, פּאַראָל האַש, סעסיע קיכלעך, און זיכערהייט לאָגס.
- **דינסט דאַטן:** הייזער, רומז, קאַטעגאָריעס, זאכן, און פּערזענלעך וואָלט רעקאָרדס וואָס איר מאַכן.
- **טעכניש דאַטן:** IP אַדרעס, בלעטערער ידענטיפיערס, און שפּראַך פּרעפֿערענץ דאַטן.

## פֿאַר וואָס מיר פּראָצעס עס
- **קאָנטאָ אָפּעראַציע:** צו שאַפֿן און פירן דיין קאָנטאָ.
- **אַוטהענטיקאַטיאָן און זיכערהייט:** צו באַשטעטיקן דיין אידענטיטעט און באַוואָרענען סעשאַנז.
- **קערן פֿעיִקייטן:** צו צושטעלן ינוואַנטאָרי און פערזענלעכע וואָלט פאַנגקשאַנז.`,
        'terms': `1. דורך ניצן **{{brandName}}**, איר שטימען צו די באדינגונגען.
2. די דינסט איז צוגעשטעלט "ווי עס איז" אָן קיין וואָראַנטיז.
3. איר בלייבט פאַראַנטוואָרטלעך פֿאַר די לעגאַליטי און אָונערשיפּ פון וואָס איר ופּלאָאַד.
4. האַלטן דיין פּאַראָל און אָפּקליבן מאַטעריאַלס זיכער.
5. מיר רעזערווירן די רעכט צו ויסמעקן קאַונץ וואָס פאַרוואַנדלען די פּאַלאַסיז.`
    },
    'ceb': {
        'privacy': `## Kinatibuk-an
Ang **{{brandName}}** usa ka open-source nga software ug mahimong ihatag pinaagi sa usa ka opisyal o self-hosted nga pag-install. Alang niini nga pag-install, ang controller sa datos o operator sa serbisyo mao ang **{{controllerName}}**.
- **Address sa Controller:** {{controllerAddress}}
- **Kontak sa Privacy:** {{privacyEmail}}
- **Kontak sa Kinatibuk-ang Suporta:** {{supportEmail}}

Kini nga pahibalo nagpatin-aw **unsa nga personal nga datos ang giproseso**, **giunsa kini nakuha**, **nganong kini giproseso**, **kinsa ang makadawat niini**, **unsa kadugay kini gitipigan**, ug **unsa nga mga katungod ang anaa kanimo**.

Kung kini nga pag-install gipadagan sa usa ka ikatulo nga partido, kana nga operator ang responsable sa bisan unsang piho nga identidad sa controller, mga pasalig sa suporta, mga detalye sa pagbalhin, ug lokal nga legal nga mga pahibalo nga magamit.

## Unsa nga datos ang among gikolekta ug giproseso
- **Datos sa account:** username, email address, password hash, session cookies, ug security logs.
- **Datos sa serbisyo:** mga balay, mga lawak, mga kategorya, mga butang, ug personal vault records nga imong gihimo.
- **Teknikal nga datos:** IP address, browser/session identifiers, ug language preference data.

## Nganong giproseso namo kini
- **Operasyon sa account:** aron paghimo ug pagpadagan sa imong account.
- **Awtentikasyon ug seguridad:** aron pagmatuod kanimo ug pagsiguro sa mga sesyon.
- **Pangunang bahin:** aron paghatag og imbentaryo ug personal vault functions.`,
        'terms': `1. Pinaagi sa paggamit sa **{{brandName}}**, mouyon ka niini nga mga kondisyon.
2. Ang serbisyo gihatag "as is" ug "as available" nga walay bisan unsang warranty.
3. Nagpabilin ka nga responsable sa legalidad ug pagpanag-iya sa imong gi-upload.
4. Itago ang imong password ug mga materyales sa pagbawi nga luwas.
5. Kami adunay katungod sa pagsuspinde o pagtangtang sa mga account nga nakalapas niini nga mga palisiya.`
    },
    'zu': {
        'privacy': `## Uhlolojikelele
I-**{{brandName}}** iyisofthiwe yomthombo ovulekile futhi ingase inikezwe ngokufakwa okusemthethweni noma okuzihlelele yona. Kulokhu kufakwa, isilawuli sedatha noma u-opharetha wesevisi ngu-**{{controllerName}}**.
- **Ikheli lesilawuli:** {{controllerAddress}}
- **Othintwayo wobumfihlo:** {{privacyEmail}}
- **Othintwayo wosekelo jikelele:** {{supportEmail}}

Lesi saziso sichaza **ukuthi iyiphi idatha yomuntu siqu ecutshungulwayo**, **ukuthi itholakala kanjani**, **kungani icutshungulwa**, **ngubani ongayithola**, **igcinwa isikhathi esingakanani**, kanye **namalungelo ongase ube nawo**.

Uma lokhu kufakwa kusetshenziswa umuntu wesithathu, lowo opharetha unesibopho sanoma iyiphi i-identithi yesilawuli ethile, izithembiso zosekelo, imininingwane yokudlulisa, nezaziso zomthetho zasendaweni ezisebenzayo.

## Iyiphi idatha esiyiqoqayo nesiyicubungulayo
- **Idatha ye-akhawunti:** igama lomsebenzisi, ikheli le-imeyili, iphasiwedi, amakhukhi eseshini, kanye nemigomo yezokuphepha.
- **Idatha yesevisi:** izindlu, amakamelo, izigaba, izinto, kanye namarekhodi e-vault yomuntu siqu owakhayo.
- **Idatha yezobuchwepheshe:** ikheli le-IP, izihlonzi zeseshini, nedatha yolimi oyithandayo.

## Kungani siyicubungula
- **Ukusebenza kwe-akhawunti:** ukudala nokusebenzisa i-akhawunti yakho.
- **Ukuqinisekisa nokuphepha:** ukukuqinisekisa nokuvikela amaseshini.
- **Izici eziyinhloko:** ukuhlinzeka nge-inventory kanye nemisebenzi ye-vault yomuntu siqu.`,
        'terms': `1. Ngokusebenzisa i-**{{brandName}}**, uyavumelana nale migomo.
2. Isevisi inikezwa "njengoba injalo" ngaphandle kwanoma yiziphi iziqinisekiso.
3. Uhlala unesibopho somthetho nobunikazi balokho okulayishayo.
4. Gcina iphasiwedi yakho nezinto zokubuyisela ziphephile.
5. Sinelungelo lokumisa noma ukususa ama-akhawunti ephula lezi zinqubomgomo.`
    },
    'fy': {
        'privacy': `## Oersjoch
**{{brandName}}** is iepen-boarnesoftware. Foar dizze ynstallaasje is de gegevensferantwurdlike **{{controllerName}}**.
## Gegevens dy't wy sammelje
- **Accountgegevens:** brûkersnamme, e-post, wachtwurd.
- **Tsjinstgegevens:** huzen, keamers, kategoryen, items.
## Wêrom wy it ferwurkje
- **Accountoperaasje:** om jo account te meitsjen en te brûken.
- **Feiligens:** om sesjes te befeiligjen.`,
        'terms': `1. Troch **{{brandName}}** te brûken, geane jo akkoard mei dizze betingsten.
2. De tsjinst wurdt "as is" levere.
3. Jo bliuwe ferantwurdlik foar wat jo uploade.`
    },
    'gd': {
        'privacy': `## Sealladh farsaing
Tha **{{brandName}}** na bhathar-bog stòr fosgailte. Airson an stàladh seo, is e an neach-riaghlaidh dàta **{{controllerName}}**.
## Dàta a bhios sinn a’ tional
- **Dàta cunntais:** ainm-cleachdaiche, post-d, facal-faire.
- **Dàta seirbheis:** taighean, seòmraichean, seòrsaichean, nithean.
## Carson a bhios sinn ga phròiseasadh
- **Obrachadh cunntais:** gus do chunntas a chruthachadh agus obrachadh.
- **Tèarainteachd:** gus seiseanan a dhèanamh tèarainte.`,
        'terms': `1. Le bhith a’ cleachdadh **{{brandName}}**, tha thu ag aontachadh ris na teirmean seo.
2. Tha an t-seirbheis air a toirt seachad "mar a tha".
3. Tha uallach ort fhathast airson na nì thu suas.`
    },
    'gl': {
        'privacy': `## Visión xeral
**{{brandName}}** é software de código aberto. Para esta instalación, o responsable dos datos é **{{controllerName}}**.
## Datos que recollemos
- **Datos da conta:** nome de usuario, correo, contrasinal.
- **Datos do servizo:** casas, habitacións, categorías, artigos.
## Por que os procesamos
- **Operación da conta:** para crear e operar a súa conta.
- **Seguridade:** para asegurar as sesións.`,
        'terms': `1. Ao usar **{{brandName}}**, acepta estes termos.
2. O servizo préstase "tal cal".
3. Vostede segue sendo responsable do que cargue.`
    },
    'ht': {
        'privacy': `## Apèsi sou lekòl la
**{{brandName}}** se lojisyèl sous louvri. Pou enstalasyon sa a, kontwolè done a se **{{controllerName}}**.
## Done nou kolekte
- **Done kont:** non itilizatè, imèl, modpas.
- **Done sèvis:** kay, chanm, kategori, atik.
## Poukisa nou trete li
- **Operasyon kont:** pou kreye ak opere kont ou.
- **Sekirite:** pou sekirize sesyon yo.`,
        'terms': `1. Lè w sèvi ak **{{brandName}}**, ou dakò ak kondisyon sa yo.
2. Sèvis la bay "jan li ye".
3. Ou rete responsab pou sa ou telechaje.`
    },
    'hy': {
        'privacy': `## Ընդհանուր նկարագիր
**{{brandName}}**-ը բաց կոդով ծրագրակազմ է: Այս տեղադրման համար տվյալների վերահսկիչը **{{controllerName}}**-ն է:
## Տվյալներ, որոնք մենք հավաքում ենք
- **Հաշվի տվյալներ:** օգտանուն, էլ. փոստ, գաղտնաբառ:
- **Ծառայության տվյալներ:** տներ, սենյակներ, կատեգորիաներ, իրեր:
## Ինչու ենք մենք մշակում այն
- **Հաշվի գործարկում:** ձեր հաշիվը ստեղծելու և գործարկելու համար:
- **Անվտանգություն:** սեսիաները պաշտպանելու համար:`,
        'terms': `1. Օգտագործելով **{{brandName}}**-ը, դուք համաձայնում եք այս պայմաններին:
2. Ծառայությունը մատուցվում է «ինչպես կա» հիմունքներով:
3. Դուք պատասխանատու եք ձեր վերբեռնած տվյալների համար:`
    },
    'ig': {
        'privacy': `## Nleba anya
**{{brandName}}** bụ sọftụwia mepere emepe. Maka ntinye a, onye njikwa data bụ **{{controllerName}}**.
## Data anyị na-anakọta
- **Data akaụntụ:** aha njirimara, email, paswọṝụ.
- **Data ọrụ:** ụlọ, ụlọ, edemede, ihe.
## Ihe kpatara anyị ji eme ya
- **Ọrụ akaụntụ:** imepụta na rụọ ọrụ akaụntụ gị.
- **Nchekwa:** iji chekwaa oge.`,
        'terms': `1. Site n'iji **{{brandName}}** eme ihe, ị kwenyere na usoro ndị a.
2. A na-enye ọrụ ahù "dịka ọ dị".
3. Ị nwere ọrụ maka ihe ị na-ebugo.`
    },
    'km': {
        'privacy': `## ទិដ្ឋភាពទូទៅ
**{{brandName}}** គឺជាកម្មវិធីកូដចំហ។ សម្រាប់ការដំឡើងនេះ អ្នកគ្រប់គ្រងទិន្នន័យគឺ **{{controllerName}}**។
## ទិន្នន័យដែលយើងប្រមូល
- **ទិន្នន័យគណនី៖** ឈ្មោះអ្នកប្រើប្រាស់ អ៊ីមែល ពាក្យសម្ងាត់។
- **ទិន្នន័យសេវាកម្ម៖** ផ្ទះ បន្ទប់ ប្រភេទ ទំនិញ។
## ហេតុអ្វីបានជាយើងដំណើរការវា
- **ប្រតិបត្តិការគណនី៖** ដើម្បីបង្កើត និងដំណើរការគណនីរបស់អ្នក។
- **សុវត្ថិភាព៖** เพื่อការពារសម័យប្រជុំ។`,
        'terms': `1. ដោយប្រើ **{{brandName}}** អ្នកយល់ព្រមតាមលក្ខខណ្ឌទាំងនេះ។
2. សេវាកម្មនេះត្រូវបានផ្តល់ជូន "ដូចដែលវាមាន" ។
3. អ្នកនៅតែទទួលខុសត្រូវចំពោះអ្វីដែលអ្នកបង្ហោះ។`
    },
    'ky': {
        'privacy': `## Жалпы маалымат
**{{brandName}}** - бул ачык булактуу программалык камсыздоо. Бул орνοтуу үчүн маалымат контроллери **{{controllerName}}** болуп саналат.
## Биз чогулткан маалыматтар
- **Аккаунт маалыматы:** колдонуучунун аты, электрондук почта, сырсөз.
- **Кызмат маалыматы:** үйлөр, бөлмөлөр, категориялар, буюмдар.
## Эмне үчүн биз аны иштетебиз
- **Аккаунт операциясы:** аккаунтуңузду түзүү жана иштетүү үчүн.
- **Коопсуздук:** сессияларды коргоо үчүн.`,
        'terms': `1. **{{brandName}}** колдонуу менен, сиз бул шарттарга макул болосуз.
2. Кызмат "кандай болсо, ошондой" негизинде берилет.
3. Сиз жүктөгөн маалыматтар үчүн жооптуусуз.`
    },
    'lb': {
        'privacy': `## Iwwersiicht
**{{brandName}}** ass Open-Source Software. Fir dës Installatioun ass den Dateverantwortlechen **{{controllerName}}**.
## Donnéeën déi mir sammelen
- **Kontodaten:** Benotzernumm, E-Mail, Passwuert.
- **Service Daten:** Haiser, Raim, Kategorien, Artikelen.
## Firwat mir se veraarbechten
- **Konto Operatioun:** fir Äre Kont ze kreéieren an ze bedreiwen.
- **Sécherheet:** fir Sessiounen ze séchere.`,
        'terms': `1. Andeems Dir **{{brandName}}** benotzt, averstanen Dir dës Konditiounen.
2. De Service gëtt "wéi en ass" zur Verfügung gestallt.
3. Dir bleift verantwortlech fir dat wat Dir eropluet.`
    },
    'lo': {
        'privacy': `## ພາບລວມ
**{{brandName}}** ແມ່ນຊອບແວໂອເພນຊອດ. ສໍາລັບການຕິດຕັ້ງນີ້, ຜູ້ຄວບຄຸມຂໍ້ມູນແມ່ນ **{{controllerName}}**.
## ຂໍ້ມູນທີ່ພວກເຮົາເກັບກໍາ
- **ຂໍ້ມູນບັນຊີ:** ຊື່ຜູ້ໃຊ້, ອີເມວ, ລະຫັດຜ່ານ.
- **ຂໍ້ມູນການບໍລິการ:** ເຮືອນ, ຫ້ອງ, ໝວດໝູ່, ລາຍການ.
## ເປັນຫຍັງພວກເຮົາຈຶ່ງປະມວນຜົນມັນ
- **ການດໍາເນີນງານບັນຊີ:** ເພື່ອສ້າງ ແລະດໍາເນີນການບັນຊີຂອງທ່ານ.
- **ຄວາມປອດໄພ:** เพื่อປົກປ້ອງເຊດຊັນ.`,
        'terms': `1. ໂດຍການນໍາໃຊ້ **{{brandName}}**, ທ່ານຕົກລົງເຫັນດີກັບเງື່ອນໄຂເຫຼົ່ານີ້.
2. ການບໍລິການແມ່ນສະຫນອງໃຫ້ "ຕາມที่เป็นอยู่".
3. ທ່ານຍັງຄົງຮັບຜິດຊອບຕໍ່ສິ່ງທີ່ທ່ານອັບໂຫລດ.`
    },
    'mg': {
        'privacy': `## Topimaso
**{{brandName}}** dia rindrankajy open-source. Ho an'ity fametrahana ity, ny mpanara-maso ny angona dia **{{controllerName}}**.
## Angona angoninay
- **Angona kaonty:** anarana mpampiasa, mailaka, teny miafina.
- **Angona serivisy:** trano, efitrano, sokajy, entana.
## Nahoana no karakarainay izany
- **Fampandehanana kaonty:** hamoronana sy hampiasana ny kaontinao.
- **Fiarovana:** hiarovana ny fotoam-pivoriana.`,
        'terms': `1. Amin'ny fampiasana ny **{{brandName}}**, dia manaiky ireo fepetra ireo ianao.
2. Ny serivisy dia omena "tahaka ny misy azy".
3. Ianao no tompon'andraikitra amin'izay ampidirinao.`
    },
    'mi': {
        'privacy': `## Tirohanga
He pūmanawa tuwhera a **{{brandName}}**. Mo tenei whakaurunga, ko te kaiwhakahaere raraunga ko **{{controllerName}}**.
## Raraunga e kohikohi ana matou
- **Raraunga pūkete:** ingoa kaiwhakamahi, īmēra, kupuhipa.
- **Raraunga ratonga:** whare, ruma, kāwai, tūemi.
## He aha i tukatukahia ai e matou
- **Mahi pūkete:** hei hanga me te whakahaere i to pūkete.
- **Haumarutanga:** hei whakamau i nga huihuinga.`,
        'terms': `1. Ma te whakamahi i a **{{brandName}}**, ka whakaae koe ki enei tikanga.
2. Ka whakaratohia te ratonga "penei".
3. Kei a koe te haepapa mo nga mea ka tuku ake koe.`
    },
    'my': {
        'privacy': `## ခြုံငုံသုံးသပ်ချက်
**{{brandName}}** သည် open-source ဆော့ဖ်ဝဲဖြစ်သည်။ ဤထည့်သွင်းမှုအတွက် ဒေတာထိန်းချုပ်သူမှာ **{{controllerName}}** ဖြစ်သည်။
## ကျွန်ုပ်တို့စုဆောင်းသောဒေတာ
- **အကောင့်ဒေတာ:** အသုံးပြုသူအမည်၊ အီးမေးလ်၊ စကားဝှက်။
- **ဝန်ဆောင်မှုဒေတာ:** အိမ်များ၊ အခန်းများ၊ အမျိုးအစားများ၊ ပစ္စည်းများ။
## အဘယ်ကြောင့် ကျွန်ုပ်တို့ ၎င်းကို လုပ်ဆောင်သနည်း။
- **အကောင့်လုပ်ဆောင်ချက်:** သင့်အကောင့်ကို ဖန်တီးပြီး လုပ်ဆောင်ရန်။
- **လုံခြုံရေး:** sessions များကို လုံခြုံစေရန်။`,
        'terms': `1. **{{brandName}}** ကို အသုံးပြုခြင်းဖြင့် သင်သည် ဤစည်းကမ်းချက်များကို သဘောတူပါသည်။
2. ဝန်ဆောင်မှုကို "ရှိရင်းစွဲအတိုင်း" ပေးဆောင်ထားပါသည်။
3. သင်တင်လိုက်သော အရာများအတွက် သင်သာလျှင် တာဝန်ရှိပါသည်။`
    },
    'ne': {
        'privacy': `## सिंहावलोकन
**{{brandName}}** एक खुला स्रोत सफ्टवेयर हो। यस स्थापनाको लागि, डाटा नियन्त्रक **{{controllerName}}** हो।
## हामीले संकलन गर्ने डाटा
- **खाता डाटा:** प्रयोगकर्ता नाम, इमेल, पासवर्ड।
- **सेवा डाटा:** घरहरू, कोठाहरू, कोटीहरू, वस्तुहरू।
## हामीले यसलाई किन प्रशोधन गर्छौं
- Nepal: खाता सञ्चालन र सुरक्षाको लागि।`,
        'terms': `1. **{{brandName}}** प्रयोग गरेर, तपाईं यी सर्तहरूमा सहमत हुनुहुन्छ।
2. सेवा "जस्तो छ" आधारमा प्रदान गरिएको छ।
3. तपाईंले अपलोड गर्नुभएको कुराको लागि तपाईं नै जिम्मेवार हुनुहुन्छ।`
    },
    'or': {
        'privacy': `## ସମୀକ୍ଷା
**{{brandName}}** ଏକ ମୁକ୍ତ ଉତ୍ସ ସଫ୍ଟୱେର୍ | ଏହି ସ୍ଥାପନ ପାଇଁ, ଡାଟା ନିୟନ୍ତ୍ରକ ହେଉଛି **{{controllerName}}** |
## ଆମେ ସଂଗ୍ରହ କରୁଥିବା ଡାଟା
- **ଆକାଉଣ୍ଟ୍ ଡାଟା:** ଉପଭୋକ୍ତା ନାମ, ଇମେଲ୍, ପାସୱାର୍ଡ |
- **ସେବା ଡାଟା:** ଘର, କୋଠରୀ, ବର୍ଗ, ଆଇଟମ୍ |`,
        'terms': `1. **{{brandName}}** ବ୍ୟବହାର କରି, ଆପଣ ଏହି ସର୍ତ୍ତାବଳୀରେ ସହମତ |
2. ସେବା "ଯେମିତି ଅଛି" ଭିତ୍ତିରେ ପ୍ରଦାନ କରାଯାଇଛି |
3. ଆପଣ ଅପଲୋଡ୍ କରୁଥିବା ବିଷୟ ପାଇଁ ଆପଣ ହିଁ ଦାୟୀ |`
    },
    'ps': {
        'privacy': `## عمومي کتنه
**{{brandName}}** یو خلاص سرچینه سافټویر دی. د دې نصبولو لپاره، د معلوماتو کنټرولر **{{controllerName}}** دی.
## هغه معلومات چې موږ یې راټولوو
- **د حساب معلومات:** کارن نوم، بریښنالیک، پټنوم.
- **د خدماتو معلومات:** کورونه، خونې، کټګورۍ، توکي.`,
        'terms': `1. د **{{brandName}}** په کارولو سره, تاسو ד دې شرایطו سره موافق یاست.
2. خدمت ד "לקה څنګه چې די" په اساس وړاندې کیږي.
3. تاسو ד هغه څه لپاره مسؤל یاست چې تاسو یې اپלוډ کوئ.`
    },
    'sd': {
        'privacy': `## جائزו
**{{brandName}}** هڪ اوپن סورس سافٽ ويئر آهي. هن انسٽاليشن لاءِ، ڊيٽא ڪنٽرولר **{{controllerName}}** آهي.
## ڊيٽא جيڪا اسان گڏ ڪريون ٿא
- **אકાਊنٽ ڊיٽא:** يوزر نالو، اي ميل، پاسورڊ.
- **سروس ڊيٽא:** گھر، ڪمرا، ڪيٽيגريون، شيون.`,
        'terms': `1. **{{brandName}}** استعمال ڪندي، توھان انھן شرطن سان متفق آھيو.
2. خدمت "جيئن آھي" جي بنياد تي مهيا ڪئي וئي آھي.
3. توھان ذميوار آھيو انھן שين لاءِ جيڪי توھان اپלוڊ ڪريו ٿא.`
    },
    'si': {
        'privacy': `## දළ විශ්ලේෂණය
**{{brandName}}** යනු විවෘත මූලාශ්‍ර මෘදුකාංගයකි. මෙම ස්ථාපනය සඳහා, දත්ත පාලකයා වන්නේ **{{controllerName}}** ය.
## අප රැස් කරන දත්ත
- **ගිණුම් දත්ත:** පරිශීලක නාමය, විද්‍යුත් තැපෑල, මුරපදය.
- **සේවා දත්ත:** නිවාස, කාමර, ප්‍රවර්ග, අයිතම.`,
        'terms': `1. **{{brandName}}** භාවිතා කිරීමෙන්, ඔබ මෙම කොන්දේසි වලට එකඟ වේ.
2. සේවාව "පවතින පරිදි" ලබා දෙනු ලැබේ.
3. ඔබ උඩුගත කරන දේ සඳහා ඔබ වගකිව යුතුය.`
    },
    'sn': {
        'privacy': `## Ongororo
**{{brandName}}** isoftware yakavhurika sosi. Pakugadzwa uku, mutungamiriri wedata ndi **{{controllerName}}**.
## Data ratinounza
- **Data reakaundi:** zita rekushandisa, email, password.
- **Data rebasa:** dzimba, makamelo, zvikamu, zvinhu.`,
        'terms': `1. Nekushandisa **{{brandName}}**, unobvuma mitemo iyi.
2. Basa racho rinopiwa "sezvariri".
3. Unoramba uine mutoro pane zvaunoisa.`
    },
    'so': {
        'privacy': `## Dulmarka guud
**{{brandName}}** waa software il furan. Rakabeyntan, kontaroolaha xogta waa **{{controllerName}}**.
## Xogta aan ururino
- **Xogta koontada:** magaca isticmaalaha, iimaylka, erayga sirta ah.
- **Xogta adeegga:** guryaha, qolalka, qaybaha, alaabta.`,
        'terms': `1. Adigoo isticmaalaya **{{brandName}}**, waxaad ku raacaysaa shuruudahan.
2. Adeegga waxaa loo bixiyaa "sida uu yahay".
3. Waxaad mas'uul ka tahay waxaad soo geli weyso.`
    },
    'st': {
        'privacy': `## Kakaretso
**{{brandName}}** ke software e bulehileng. Bakeng sa ts'ebetso ena, molaoli oa data ke **{{controllerName}}**.
## Data eo re e bokellang
- **Data ea akhaonto:** lebitso la mosebelisi, lengolo-tsoibila, password.
- **Data ea tšebeletso:** matlo, likamore, lihlopha, lintho.`,
        'terms': `1. Ka ho sebelisa **{{brandName}}**, u lumellana le lipehelo tsena.
2. Tšebeletso e fanoa ka "joalo ka ha e le teng".
3. U lula u ikarabella bakeng sa seo u se kenyang.`
    },
    'yo': {
        'privacy': `## Akopọ
**{{brandName}}** jẹ sọfitiwia orisun ṣiṣi. Fun fifi sori ẹrọ yii, oludari data jẹ **{{controllerName}}**.
## Data ti a gba
- **Data akọọlẹ:** orukọ olumulo, imeeli, ọrọ igbaniwọle.
- **Data iṣẹ:** awọn ile, awọn yara, awọn ẹka, awọn ohun kan.`,
        'terms': `1. Nipa lilo **{{brandName}}**, o gba si awọn ofin wọnyi.
2. Iṣẹ naa ni a pese "bi o ti wa".
3. O wa ni iduro fun ohun ti o gbe soke.`
    }
};

async function main() {
    for (const [lang, trans] of Object.entries(MANUAL_TRANSLATIONS)) {
        const filePath = path.join(PUBLIC_LOCALES_DIR, lang, 'translation.json');
        if (!fs.existsSync(filePath)) continue;

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        content.legal.privacy_policy_content = trans.privacy;
        content.legal.terms_of_service_content = trans.terms;

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        console.log(`Manually repaired ${lang}`);
    }
}

main();
