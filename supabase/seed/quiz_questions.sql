-- ─── Swedish Driving Theory Quiz Seed Data ───────────────────────────────────
-- Run this in the Supabase Dashboard SQL Editor after bootstrapping the org.
-- Questions are system-wide (organization_id IS NULL) and available to all orgs.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO quiz_questions (id, organization_id, category, difficulty, question_text, options, explanation, is_active, sort_order)
VALUES

-- ── VÄGMÄRKEN (Road signs) ────────────────────────────────────────────────────

(gen_random_uuid(), NULL, 'Vägmärken', 'easy',
 'Vad betyder ett rött åttkantigt vägmärke med texten STOP?',
 '[{"text":"Du ska minska hastigheten","is_correct":false},{"text":"Du ska stanna helt och lämna företräde","is_correct":true},{"text":"Du ska välja spår","is_correct":false},{"text":"Vägen är avstängd","is_correct":false}]',
 'Stoppmärket (B1) kräver att du stannar helt vid stopplinje och lämnar företräde till annan trafik innan du fortsätter.', true, 10),

(gen_random_uuid(), NULL, 'Vägmärken', 'easy',
 'Vad innebär ett vitt triangelmärke med röd kant och spetsen nedåt?',
 '[{"text":"Motorväg börjar","is_correct":false},{"text":"Varning för korsning","is_correct":false},{"text":"Väjningsplikt — lämna företräde","is_correct":true},{"text":"Enskild väg","is_correct":false}]',
 'Väjningspliktsmärket (B2) innebär att du ska lämna företräde till fordon på den korsande vägen. Du behöver inte stanna om vägen är fri.', true, 20),

(gen_random_uuid(), NULL, 'Vägmärken', 'easy',
 'Vad visar ett blått rektangulärt märke med vit pil som pekar åt höger?',
 '[{"text":"Påbjuden körriktning åt höger","is_correct":true},{"text":"Rekommenderat körfält","is_correct":false},{"text":"Obligatorisk omkörning till höger","is_correct":false},{"text":"Parkeringsplats till höger","is_correct":false}]',
 'Blå märken med vita pilar visar påbjuden körriktning (D-märken). Pilen åt höger innebär att du måste svänga eller hålla dig åt höger.', true, 30),

(gen_random_uuid(), NULL, 'Vägmärken', 'medium',
 'Vad betyder ett gult varningsmärke (gul romb) med svart vägbana och kurva?',
 '[{"text":"Brant backe nedför","is_correct":false},{"text":"Varning för kurva","is_correct":true},{"text":"Cyklister i vägbanan","is_correct":false},{"text":"Vägkorsning","is_correct":false}]',
 'Gula varningsskyltar (A-märken) har rombform och varnar för fara framför. Kurvsymbolen innebär att du bör sänka hastigheten inför kurvan.', true, 40),

(gen_random_uuid(), NULL, 'Vägmärken', 'medium',
 'Vilket vägmärke anger att parkering är förbjuden?',
 '[{"text":"Blå cirkel med rött kryss","is_correct":false},{"text":"Blå rektangel med P","is_correct":false},{"text":"Rund blå skylt med rött kryss och P","is_correct":true},{"text":"Gul triangel med bil","is_correct":false}]',
 'Parkeringsförbudet (C-märke) är en rund blå skylt med ett rött kryss över ett P. Blå rektangel med P anger en tillåten parkeringsplats.', true, 50),

(gen_random_uuid(), NULL, 'Vägmärken', 'medium',
 'Vad innebär en vit pil riktad uppåt på svart rund skylt (vägmarkeringsmärke)?',
 '[{"text":"Körfältet tar slut","is_correct":false},{"text":"Kör rakt fram — körfältspil","is_correct":true},{"text":"Omkörning förbjuden","is_correct":false},{"text":"Autobahnpåfart","is_correct":false}]',
 'Körfältspilen på vägbanan eller vägmarkering visar vilken riktning du ska köra i det körfältet. Uppåtriktad pil innebär rakt fram.', true, 60),

(gen_random_uuid(), NULL, 'Vägmärken', 'hard',
 'Du ser ett märke: vit cirkel med röd kant och svart siffra "50". Vad innebär det?',
 '[{"text":"Rekommenderad hastighet 50 km/h","is_correct":false},{"text":"Hastigheten får inte överstiga 50 km/h","is_correct":true},{"text":"Minsta tillåtna hastighet 50 km/h","is_correct":false},{"text":"Hastigheten ska vara minst 50 km/h på motorvägen","is_correct":false}]',
 'Hastighetsbegränsningsmärket (C31) är en rund vit skylt med röd kant. Det anger maxhastighet, inte rekommendation. Rekommenderad hastighet har gul bakgrund.', true, 70),

-- ── TRAFIKREGLER (Traffic rules) ──────────────────────────────────────────────

(gen_random_uuid(), NULL, 'Trafikregler', 'easy',
 'Vilken är den allmänna hastighetsgränsen på väg utanför tättbebyggt område (landsväg) i Sverige?',
 '[{"text":"70 km/h","is_correct":false},{"text":"90 km/h","is_correct":true},{"text":"110 km/h","is_correct":false},{"text":"100 km/h","is_correct":false}]',
 'Den generella hastighetsgränsen på landsväg (utanför tättbebyggt område, ej motorväg/motortrafikled) är 70 km/h om ingen annan gräns anges. Obs: den höjdes till 90 km/h på vissa vägar. Standardsvaret enligt Trafikverket: 70 km/h är standard utanför tättbebyggt, men se lokala skyltar.', true, 80),

(gen_random_uuid(), NULL, 'Trafikregler', 'easy',
 'Vad gäller i en tättbebyggd ort utan hastighetsskylt?',
 '[{"text":"50 km/h","is_correct":true},{"text":"70 km/h","is_correct":false},{"text":"40 km/h","is_correct":false},{"text":"30 km/h","is_correct":false}]',
 'Inom tättbebyggt område (markerat med skylt) är hastighetsgränsen 50 km/h om inget annat anges.', true, 90),

(gen_random_uuid(), NULL, 'Trafikregler', 'easy',
 'Vem har företräde i en rondell (cirkulationsplats) i Sverige?',
 '[{"text":"Den som kör in i rondellen","is_correct":false},{"text":"Den som redan befinner sig i rondellen","is_correct":true},{"text":"Den som kör snabbast","is_correct":false},{"text":"Fordon till höger om dig","is_correct":false}]',
 'I Sverige har trafik i rondellen företräde framför trafik som ska köra in. Vid infartsvägen finns vanligen väjningsplikt- eller stoppmärke.', true, 100),

(gen_random_uuid(), NULL, 'Trafikregler', 'medium',
 'Du ska svänga vänster i en korsning. En cyklist kommer från höger på cykelväg. Vem har företräde?',
 '[{"text":"Du eftersom du är på motorvägen","is_correct":false},{"text":"Cyklisten — du måste lämna företräde","is_correct":true},{"text":"Det beror på vem som kom först","is_correct":false},{"text":"Du har företräde för att du är på motorvägen","is_correct":false}]',
 'När du svänger vänster i en korsning måste du ge företräde åt cyklister som korsar den väg du svänger in på, även om de befinner sig på en cykelväg.', true, 110),

(gen_random_uuid(), NULL, 'Trafikregler', 'medium',
 'När är det tillåtet att köra om ett fordon som stannat för att släppa av passagerare?',
 '[{"text":"Aldrig","is_correct":false},{"text":"Alltid om vägen är fri","is_correct":false},{"text":"Om det går att köra om utan att orsaka fara och skyltning tillåter det","is_correct":true},{"text":"Bara om föraren gett tecken att det är OK","is_correct":false}]',
 'Omkörning är tillåtet om du kan göra det utan att orsaka fara och det inte finns förbud mot det (t.ex. heldragen mittlinje, förbud mot omkörning).', true, 120),

(gen_random_uuid(), NULL, 'Trafikregler', 'medium',
 'Vad gäller vid övergångsstället? Du ska svänga och ett övergångsställe korsar den väg du svänger in på.',
 '[{"text":"Du har alltid företräde framför fotgängare","is_correct":false},{"text":"Fotgängare på övergångsstället har företräde","is_correct":true},{"text":"Det gäller bara om de redan är ute på gatan","is_correct":false},{"text":"Trafiksignalen avgör vem som har företräde","is_correct":false}]',
 'Vid övergångsställen ska fordonsföraren lämna företräde åt gående som gått ut på eller just ska gå ut på övergångsstället.', true, 130),

(gen_random_uuid(), NULL, 'Trafikregler', 'hard',
 'Du kör på en 2+1-väg. Vad gäller för mötesfria körfält?',
 '[{"text":"Du kan köra om i det extra körfältet oavsett riktning","is_correct":false},{"text":"Det extra körfältet växlar sida och används enbart för den riktning som har det","is_correct":true},{"text":"Mittremsan är alltid på vänster sida","is_correct":false},{"text":"Du måste hålla 110 km/h i det extra körfältet","is_correct":false}]',
 'På 2+1-väg alternerar det tredje körfältet sida var 5-10:e km. Du får bara använda det körfält som tillhör din färdriktning. Separeras ofta av vajerräcke.', true, 140),

(gen_random_uuid(), NULL, 'Trafikregler', 'hard',
 'Vilken typ av linje på vägbanan får du ALDRIG korsa?',
 '[{"text":"Streckad vit linje","is_correct":false},{"text":"Dubbel heldragen gul linje","is_correct":false},{"text":"Heldragen vit mittlinje","is_correct":true},{"text":"Gul streckad linje","is_correct":false}]',
 'En heldragen vit mittlinje (RVR: vägmarkering R1) är absolut körfältsavskiljare. Du får inte korsa eller köra på den. Streckad linje tillåter omkörning när det är säkert.', true, 150),

-- ── FORDON (Vehicle knowledge) ────────────────────────────────────────────────

(gen_random_uuid(), NULL, 'Fordon', 'easy',
 'Vad indikerar en röd varningslampa (utropstecken) på instrumentpanelen?',
 '[{"text":"Bränslet håller på att ta slut","is_correct":false},{"text":"Ett fel som kräver omedelbar uppmärksamhet","is_correct":true},{"text":"Service rekommenderas snart","is_correct":false},{"text":"Dörren är inte helt stängd","is_correct":false}]',
 'Röda varningslampor signalerar allvarliga fel som kan skada motorn eller äventyra säkerheten. Stanna om möjligt och kontakta verkstad.', true, 160),

(gen_random_uuid(), NULL, 'Fordon', 'easy',
 'Hur kontrollerar du att dina bromsljus fungerar utan hjälp?',
 '[{"text":"Kör mot en vägg och titta i backspegeln","is_correct":false},{"text":"Be någon stå bakom bilen medan du trampar på bromsen","is_correct":true},{"text":"Kontrollera med en spegel mot bakrutan","is_correct":false},{"text":"Det kan bara verkstaden kontrollera","is_correct":false}]',
 'Be en person stå bakom bilen och bekräfta att bromsljusen tänds när du trampar på bromspedalen. Alternativt kan du backa mot en reflekterande yta.', true, 170),

(gen_random_uuid(), NULL, 'Fordon', 'medium',
 'Vilket mönsterdjup är det lagliga minimum för sommardäck?',
 '[{"text":"1,0 mm","is_correct":false},{"text":"1,6 mm","is_correct":true},{"text":"2,0 mm","is_correct":false},{"text":"3,0 mm","is_correct":false}]',
 'Lagstadgat minimum är 1,6 mm mönsterdjup för sommardäck. Trafiksäkerhetsexperten rekommenderar 3 mm av säkerhetsskäl.', true, 180),

(gen_random_uuid(), NULL, 'Fordon', 'medium',
 'Vad ska du göra om varningslampan för motoroljenivå tänds under körning?',
 '[{"text":"Fortsätt köra till nästa bensinstation","is_correct":false},{"text":"Stanna snarast säkert och stäng av motorn","is_correct":true},{"text":"Minska hastigheten och kör hem","is_correct":false},{"text":"Fyll på olja direkt utan att stanna","is_correct":false}]',
 'Otillräckligt motorolja kan orsaka allvarliga motorskador inom sekunder. Stanna på säker plats, stäng av motorn och kontrollera oljenivån.', true, 190),

(gen_random_uuid(), NULL, 'Fordon', 'hard',
 'Du märker att bilen drar åt sidan när du bromsar. Vad kan orsaken vara?',
 '[{"text":"Fel lufttryck på ett däck eller ojämnt slitna bromsbelägg","is_correct":true},{"text":"Bilen är överlast","is_correct":false},{"text":"Kylarvätska i låg nivå","is_correct":false},{"text":"Motorn behöver service","is_correct":false}]',
 'Bromsdrag kan bero på punktering eller lågt lufttryck, ojämnt slitna bromsklossar, skadade bromsskivor eller låst bromscylinder. Ska ses av verkstad.', true, 200),

-- ── MILJÖ (Environment) ───────────────────────────────────────────────────────

(gen_random_uuid(), NULL, 'Miljö', 'easy',
 'Hur minskar du bränsleförbrukningen mest effektivt?',
 '[{"text":"Kör med högt varvtal","is_correct":false},{"text":"Kör med jämn hastighet, förutse trafiken och undvik onödig acceleration","is_correct":true},{"text":"Håll alltid max tillåten hastighet","is_correct":false},{"text":"Kör med all el-utrustning påslagen","is_correct":false}]',
 'Mjuk körning, förutseende och jämn fart minskar bränsleförbrukning med 10–30%. Onödig acceleration och kraftig inbromsning ökar förbrukningen.', true, 210),

(gen_random_uuid(), NULL, 'Miljö', 'easy',
 'Vilken körning är mest miljövänlig?',
 '[{"text":"Hög hastighet på motorväg","is_correct":false},{"text":"Konstant hastighet med tidigt växling till högre växel","is_correct":true},{"text":"Tomgångskörning i rusningstrafik","is_correct":false},{"text":"Frekventa acceleration och inbromsning","is_correct":false}]',
 'Tidigt uppväxlat och jämnt hastighet minskar motorvarvtal och bränsleförbrukning. Tomgångskörning slösar bränsle utan framförflyttning.', true, 220),

(gen_random_uuid(), NULL, 'Miljö', 'medium',
 'Hur länge bör du max låta en modern bil stå på tomgång för att värma upp den?',
 '[{"text":"5–10 minuter","is_correct":false},{"text":"Tills temperaturvisaren nått normallägе","is_correct":false},{"text":"Moderna bilar behöver ingen uppvärmning — kör direkt men försiktigt","is_correct":true},{"text":"2–3 minuter","is_correct":false}]',
 'Moderna bränsleinsprutade bilar behöver inte stå och värmas. Kör iväg direkt men undvik höga varvtal tills motorn är varm. Onödig tomgång ökar utsläpp.', true, 230),

(gen_random_uuid(), NULL, 'Miljö', 'hard',
 'Vilket bränsle ger lägst koldioxidutsläpp per km vid normal körning?',
 '[{"text":"Dieselbil","is_correct":false},{"text":"Bensinbil","is_correct":false},{"text":"Elbil laddad med förnybar el","is_correct":true},{"text":"Naturgas (CNG)","is_correct":false}]',
 'En elbil laddad med förnybar el (sol, vind, vattenkraft) ger nära noll CO₂-utsläpp i drift. Elbil laddad med kolkraft kan vara sämre än dieselbil totalt sett.', true, 240),

-- ── ALKOHOL & DROGER (Alcohol & drugs) ───────────────────────────────────────

(gen_random_uuid(), NULL, 'Alkohol & droger', 'easy',
 'Vad är den lagliga promillegränsen i Sverige?',
 '[{"text":"0,5 promille","is_correct":false},{"text":"0,2 promille","is_correct":true},{"text":"0,8 promille","is_correct":false},{"text":"1,0 promille","is_correct":false}]',
 'I Sverige är gränsen för rattfylleri 0,2 promille alkohol i blodet. Vid 1,0 promille eller mer är det grovt rattfylleri med fängelse som påföljd.', true, 250),

(gen_random_uuid(), NULL, 'Alkohol & droger', 'easy',
 'Hur länge stannar alkohol normalt kvar i kroppen?',
 '[{"text":"1 timme per enhet alkohol","is_correct":true},{"text":"30 minuter per enhet alkohol","is_correct":false},{"text":"Kaffe och kallt vatten hjälper att snabba på eliminationen","is_correct":false},{"text":"Det beror helt på hur full man känner sig","is_correct":false}]',
 'Levern förbränner ca 1 enhet alkohol/timme (0,8 g = 1 cl ren alkohol = ca 1,5 cl sprit / 15 cl vin / 50 cl starköl). Kaffe, vatten och tid påverkar inte hastigheten.', true, 260),

(gen_random_uuid(), NULL, 'Alkohol & droger', 'medium',
 'Du har tagit en sömntablett med läkares ordination. Får du köra bil?',
 '[{"text":"Ja, om du tagit den för mer än 8 timmar sedan","is_correct":false},{"text":"Nej aldrig med sömntabletter","is_correct":false},{"text":"Det beror på om läkemedlet påverkar din körförmåga — fråga läkaren","is_correct":true},{"text":"Ja om du känner dig pigg","is_correct":false}]',
 'Många läkemedel (inkl. sömntabletter, antihistaminer och smärtstillande) kan påverka reaktionsförmågan. Kontrollera alltid med läkare eller på bipacksedeln om körning är tillåten.', true, 270),

(gen_random_uuid(), NULL, 'Alkohol & droger', 'hard',
 'Vad är straffet för grovt rattfylleri (≥1,0 promille)?',
 '[{"text":"Böter och körkortsindragning","is_correct":false},{"text":"Fängelse i upp till 2 år och körkortsindragning","is_correct":true},{"text":"Villkorlig dom och dagsböter","is_correct":false},{"text":"Enbart körkortsindragning","is_correct":false}]',
 'Grovt rattfylleri kan ge upp till 2 års fängelse. Körkortet dras normalt in 12–36 månader. Vid olycka eller hög promille kan straffet bli längre.', true, 280),

-- ── SÄKERHET (Safety) ─────────────────────────────────────────────────────────

(gen_random_uuid(), NULL, 'Säkerhet', 'easy',
 'Varför är det viktigt att använda säkerhetsbälte?',
 '[{"text":"Det är bara lag, det ger ingen praktisk fördel","is_correct":false},{"text":"Det minskar risken att kastas ut ur bilen och reducerar skador vid kollision","is_correct":true},{"text":"Det skyddar bara om du sitter i framsätet","is_correct":false},{"text":"Det behövs bara vid körning på motorväg","is_correct":false}]',
 'Säkerhetsbältet minskar dödligheten vid trafikolyckor med upp till 50%. Det håller dig kvar i sätet vid krock och samverkar med krockkudden.', true, 290),

(gen_random_uuid(), NULL, 'Säkerhet', 'easy',
 'Vad ska du göra om du känner dig trött under körning?',
 '[{"text":"Öppna fönstret och öka radiovolumet","is_correct":false},{"text":"Ta en kortpaus, sov 15–30 minuter eller drick kaffe och vila","is_correct":true},{"text":"Kör fortare för att komma fram snabbare","is_correct":false},{"text":"Byt körfält ofta för att hålla dig vaken","is_correct":false}]',
 'Trötthet är lika farlig som alkohol. 15–30 minuters sömn är det mest effektiva botemedlet. Kaffe ger kortvarig effekt men ersätter inte sömn.', true, 300),

(gen_random_uuid(), NULL, 'Säkerhet', 'medium',
 'Vad är säkerhetsavståndet (tumregeln) till framförvarande fordon?',
 '[{"text":"10 meter per 10 km/h i hastighet","is_correct":false},{"text":"Minst 3 sekunder i normala förhållanden (fler vid dålig sikt/halt)","is_correct":true},{"text":"Minst 50 meter alltid","is_correct":false},{"text":"Halva mätarvisarens siffra i meter","is_correct":false}]',
 'Tre-sekundersregeln: välj ett fast föremål, när framförvarande passerar det räknar du "ettusen ett, ettusen två, ettusen tre". Din bil bör passera objektet sist. Vid halt väglag dubbla avståndet.', true, 310),

(gen_random_uuid(), NULL, 'Säkerhet', 'medium',
 'Du är med om en trafikolycka. Vad är ditt FÖRSTA ansvar?',
 '[{"text":"Ta foton för försäkringen","is_correct":false},{"text":"Ringa polisen","is_correct":false},{"text":"Stanna, varna andra och hjälpa skadade — ring SOS 112 vid behov","is_correct":true},{"text":"Flytta bilen ut ur körfältet","is_correct":false}]',
 'Stannadeplikten innebär att du alltid ska stanna vid olycka. Säkra olycksplatsen, varna andra trafikanter, ge första hjälpen och ring 112 om det behövs.', true, 320),

(gen_random_uuid(), NULL, 'Säkerhet', 'hard',
 'Vilken är den vanligaste orsaken till singelolyckor på landsbygd i Sverige?',
 '[{"text":"Mekaniska fel på fordonet","is_correct":false},{"text":"Trötthet, höga hastigheter och avkörning i kurvor","is_correct":true},{"text":"Dålig sikt pga regn","is_correct":false},{"text":"Sammanstötning med vilt","is_correct":false}]',
 'Singelolyckor orsakas vanligen av trötthet, distraktioner (mobil) eller för hög hastighet i kombination med vinterväglag. Avkörning i kurva är ett vanligt scenario.', true, 330),

(gen_random_uuid(), NULL, 'Säkerhet', 'hard',
 'Vad innebär "krockkuddestyrning" och hur påverkar det hur du håller i ratten?',
 '[{"text":"Du ska hålla händerna på 3 och 9 (sidan) för att minska skaderisken om krockkudden löser ut","is_correct":true},{"text":"Du ska alltid hålla ratten med en hand","is_correct":false},{"text":"Krockkuddar kräver att du håller ratten med 10 och 2","is_correct":false},{"text":"Krockkudden påverkar inte handposition","is_correct":false}]',
 'Modern rekommendation (Trafikverket) är händerna vid 3 och 9 (sidan av ratten). Det minskar risken att armarna kastas in i ansiktet om krockkudden löser ut, jämfört med 10-och-2-greppet.', true, 340);
