-- ════════════════════════════════════════════════════════════════════════════
-- Quiz Question Bank Expansion
--
-- Adds 50 additional system-wide Swedish driving theory questions (10 per
-- category) to complement the 25 already seeded in phase_c_theory_quiz.
-- Also adds a unique index on (category, question_text) for idempotency.
--
-- Total after this migration: ~75 system-wide questions (15 per category).
-- With 10-question quizzes drawn from a shuffled pool, this gives good
-- variety between sessions.
-- ════════════════════════════════════════════════════════════════════════════

-- Idempotency guard — prevents duplicate questions if migration is re-run
CREATE UNIQUE INDEX IF NOT EXISTS quiz_questions_dedup_idx
  ON quiz_questions (category, question_text)
  WHERE organization_id IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- Trafikregler — additional 10 questions
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO quiz_questions (organization_id, category, question_text, options, explanation, difficulty, sort_order)
VALUES

(NULL, 'trafikregler',
 'Får du använda mobiltelefon i handen medan du kör bil i Sverige?',
 '[
   {"text": "Ja, om du kör i under 50 km/h",                              "is_correct": false},
   {"text": "Ja, för kortare samtal under 30 sekunder",                   "is_correct": false},
   {"text": "Nej, det är förbjudet och kan leda till böter",              "is_correct": true},
   {"text": "Ja, om du håller telefonen mot ratten",                      "is_correct": false}
 ]'::jsonb,
 'Det är förbjudet att hålla och använda mobiltelefon under körning i Sverige. Du kan använda hands-free. Böter är för närvarande 1 500 kr.',
 'easy', 10),

(NULL, 'trafikregler',
 'Vad gäller om du vill byta körfält på motorväg?',
 '[
   {"text": "Du kan byta fritt om du kör i lägre hastighet än fordon bakom",           "is_correct": false},
   {"text": "Du ska blinka, kontrollera i sidospegeln och döda vinkeln, sedan byta",   "is_correct": true},
   {"text": "Fordon framför har alltid ansvaret om kollision sker vid filbyte",         "is_correct": false},
   {"text": "Det räcker att kontrollera i sidospegeln utan att blinka",                "is_correct": false}
 ]'::jsonb,
 'Vid körfältsbyte ska du blinka i god tid, kontrollera bakåt i spegeln och döda vinkeln (blindspot) innan du byter fil. Du ansvarar alltid för att manövern kan genomföras säkert.',
 'normal', 10),

(NULL, 'trafikregler',
 'Vad är hastighetsgränsen på en väg med vägbelysning men utan skyltad begränsning?',
 '[
   {"text": "50 km/h",  "is_correct": true},
   {"text": "70 km/h",  "is_correct": false},
   {"text": "80 km/h",  "is_correct": false},
   {"text": "90 km/h",  "is_correct": false}
 ]'::jsonb,
 'På en väg med vägbelysning (gaturbelysning) gäller hastighetsgränsen för tättbebyggt område: 50 km/h — om inte annan gräns är skyltad.',
 'normal', 10),

(NULL, 'trafikregler',
 'Vad ska du göra om ett utryckningsfordon (ambulans, polis, brandkår) med blåljus och siren närmar sig bakifrån?',
 '[
   {"text": "Öka hastigheten för att inte hindra utryckningsfordonet",          "is_correct": false},
   {"text": "Håll kvar din position — utryckningsfordon ska alltid köra runt",  "is_correct": false},
   {"text": "Flytta dig åt sidan och lämna fri väg så snart det är möjligt",   "is_correct": true},
   {"text": "Bromsa till stopp omedelbart oavsett trafiksituation",             "is_correct": false}
 ]'::jsonb,
 'Du är skyldig att ge fri väg för utryckningsfordon med blåljus och siren. Flytta dig säkert åt sidan och stanna vid behov tills fordonet passerat.',
 'easy', 10),

(NULL, 'trafikregler',
 'Vad gäller för U-sväng i Sverige?',
 '[
   {"text": "U-sväng är alltid tillåten om inga fordon är i närheten",                         "is_correct": false},
   {"text": "U-sväng är alltid förbjuden i tättbebyggt område",                               "is_correct": false},
   {"text": "U-sväng är tillåten om det inte hindrar annan trafik och sikt är god, om inte förbjuden med skylt", "is_correct": true},
   {"text": "U-sväng kräver alltid att du ger tecken åt alla hållen i minst 3 sekunder",      "is_correct": false}
 ]'::jsonb,
 'U-sväng är tillåten om den kan göras utan fara eller onödig olägenhet för annan trafik, och inte är förbjuden med vägmärke. Förbjudet vid t.ex. spårväg, backe, kurva med dålig sikt.',
 'hard', 10),

(NULL, 'trafikregler',
 'Hur länge får du parkera på samma plats i tättbebyggt område utan parkeringsförbud?',
 '[
   {"text": "Högst 12 timmar på vardagar",    "is_correct": false},
   {"text": "Högst 24 timmar på vardagar",    "is_correct": true},
   {"text": "Hur länge du vill om det inte finns en skylt",  "is_correct": false},
   {"text": "Högst 48 timmar i sträck",       "is_correct": false}
 ]'::jsonb,
 'I tättbebyggt område får du parkera i högst 24 timmar i sträck på samma plats under vardagar (måndag–fredag, ej helgdag) om inte annat anges.',
 'normal', 10),

(NULL, 'trafikregler',
 'Vad innebär väjningsplikt i en korsning utan vägmärken eller trafikljus?',
 '[
   {"text": "Den som kom till korsningen sist har väjningsplikt",      "is_correct": false},
   {"text": "Den tyngste fordonet har alltid företräde",               "is_correct": false},
   {"text": "Du ska ge väj för fordon som kommer från höger",          "is_correct": true},
   {"text": "Gångtrafikanter alltid har företräde",                    "is_correct": false}
 ]'::jsonb,
 'I korsning utan vägmärken (högerregeln) gäller att du ska ge väj för fordon som kommer från din högra sida. Regeln gäller inte mot utfartsvägar, cykelvägar och liknande.',
 'normal', 10),

(NULL, 'trafikregler',
 'Hur nära ett övergångsställe är det förbjudet att parkera?',
 '[
   {"text": "5 meter",  "is_correct": false},
   {"text": "10 meter", "is_correct": true},
   {"text": "15 meter", "is_correct": false},
   {"text": "20 meter", "is_correct": false}
 ]'::jsonb,
 'Det är förbjudet att parkera inom 10 meter före ett övergångsställe eller en cykelöverfart. Att parkera för nära minskar sikten för fotgängare och trafikfarliga situationer kan uppstå.',
 'hard', 10),

(NULL, 'trafikregler',
 'Vilken hastighet gäller som standard på landsväg (väg utanför tättbebyggt område) om inget annat är skyltad?',
 '[
   {"text": "70 km/h",  "is_correct": false},
   {"text": "80 km/h",  "is_correct": true},
   {"text": "90 km/h",  "is_correct": false},
   {"text": "100 km/h", "is_correct": false}
 ]'::jsonb,
 'Bashastigheten på vägar utanför tättbebyggt område (landsväg) är 80 km/h om inte annan gräns är skyltat. Motorväg och motortrafikled har andra gränser.',
 'easy', 10),

(NULL, 'trafikregler',
 'Måste du bära säkerhetsbälte om bilen saknar krockkudde?',
 '[
   {"text": "Nej, säkerhetsbälte behövs bara om bilen har krockkudde",           "is_correct": false},
   {"text": "Nej, det är upp till varje förare att avgöra",                      "is_correct": false},
   {"text": "Ja, säkerhetsbälte är obligatoriskt oavsett om bilen har krockkudde", "is_correct": true},
   {"text": "Ja, men bara på motorväg och landväg",                              "is_correct": false}
 ]'::jsonb,
 'Säkerhetsbälte är obligatoriskt för alla passagerare och förare oavsett fordonets utrustning. Föraren ansvarar för att alla under 15 år i fordonet är fastspända.',
 'easy', 10),

-- ════════════════════════════════════════════════════════════════════════════
-- Vägmärken — additional 10 questions
-- ════════════════════════════════════════════════════════════════════════════

(NULL, 'vagmarken',
 'Vad innebär ett vägmärke med en röd triangel och en svart streckteckning av en bil på hal yta?',
 '[
   {"text": "Obligatorisk användning av vinterdäck",                   "is_correct": false},
   {"text": "Varning för halt väglag",                                 "is_correct": true},
   {"text": "Testbana för fordon framåt",                              "is_correct": false},
   {"text": "Förbjudet att köra om vid halt väglag",                   "is_correct": false}
 ]'::jsonb,
 'Varningsmärket med bil på hal yta varnar för risk för halka — t.ex. isigt väglag, lera eller grus på körbanan. Sänk hastigheten och öka säkerhetsavståndet.',
 'normal', 20),

(NULL, 'vagmarken',
 'Vad innebär ett vitt rektangulärt vägmärke med texten "STOPP" och en röd rand?',
 '[
   {"text": "Att du befinner dig vid en kommande stopplikt 200 meter framåt",  "is_correct": false},
   {"text": "Att du nu passerar stopplinjen — du måste ha stannat och givit väj", "is_correct": true},
   {"text": "Att du måste stanna om polisen begär det",                         "is_correct": false},
   {"text": "Att en tull eller kontrollstation finns framåt",                   "is_correct": false}
 ]'::jsonb,
 'STOPP-skylten kombinerat med stopplinje innebär att du är skyldiga att ha stannat fullständigt (0 km/h) och gett väj för annan trafik innan du kör vidare.',
 'normal', 20),

(NULL, 'vagmarken',
 'Vad innebär en blå rektangulär skylt med en vit pil som pekar uppåt?',
 '[
   {"text": "Rekommenderad körriktning — du väljer om du vill följa den",   "is_correct": false},
   {"text": "Obligatorisk körriktning — du måste köra rakt fram",           "is_correct": true},
   {"text": "Motorväg börjar i denna riktning",                             "is_correct": false},
   {"text": "Enkelriktad väg — trafik kommer mot dig",                      "is_correct": false}
 ]'::jsonb,
 'Blå cirkel eller rektangel med vit pil är ett påbudsmärke. Det anger obligatorisk körriktning. Du måste följa pilens riktning.',
 'normal', 20),

(NULL, 'vagmarken',
 'Vad innebär ett rött cirkelmärke med ett vitt fält (utan siffror eller symboler)?',
 '[
   {"text": "Förbud att parkera",                               "is_correct": false},
   {"text": "Förbud att stanna",                                "is_correct": false},
   {"text": "Förbud mot trafik i bägge riktningar (genomfart förbjuden)", "is_correct": true},
   {"text": "Förbud mot lastbilar",                             "is_correct": false}
 ]'::jsonb,
 'Den röda cirkeln med vitt fält (ingångsmärke) innebär att all trafik är förbjuden att passera märket — genomfartstrafik är inte tillåten.',
 'hard', 20),

(NULL, 'vagmarken',
 'Vad visar ett vägmärke med en röd triangel och en svart barnsilhuett?',
 '[
   {"text": "Skola eller lekplats — barn kan finnas på eller nära vägen",  "is_correct": true},
   {"text": "Förbud mot barn i fordonet utan bilbarnstol",                 "is_correct": false},
   {"text": "Rast- och lekplats 500 meter framåt",                        "is_correct": false},
   {"text": "Dagis med bevakning",                                         "is_correct": false}
 ]'::jsonb,
 'Varningsmärket med barn (barnvarningsmärke) varnar för att det kan finnas barn nära eller på vägen, t.ex. nära skola, lekplats eller fritidshem. Sänk hastigheten och var extra uppmärksam.',
 'easy', 20),

(NULL, 'vagmarken',
 'Vad innebär blå skylt med vit "E" och siffror (t.ex. E4)?',
 '[
   {"text": "Europaväg — identifiering av vägens europeiska beteckning",    "is_correct": true},
   {"text": "Elvägstation — laddningsmöjligheter finns vid vägen",          "is_correct": false},
   {"text": "Expressväg — motorvägsregler gäller",                         "is_correct": false},
   {"text": "Nödutgång markering vid tunnel",                               "is_correct": false}
 ]'::jsonb,
 'E-skyltar (europavägar) identifierar vägar som ingår i det europeiska vägnätet. E4 är exempelvis vägen från Helsingborg till Stockholm och vidare till Haparanda.',
 'easy', 20),

(NULL, 'vagmarken',
 'Vad betyder ett vägmärke med röd triangel och en svart bro-silhuett?',
 '[
   {"text": "Bro med viktbegränsning framåt",                    "is_correct": false},
   {"text": "Varning för bro med smal körbana eller räcken",     "is_correct": true},
   {"text": "Bro stängd för tung trafik",                        "is_correct": false},
   {"text": "Vägarbete på bron",                                 "is_correct": false}
 ]'::jsonb,
 'Varningsskylten med bro varnar för en smal bro eller en bro med begränsad sidoklirens. Anpassa hastigheten och var beredd på mötande trafik på smala broar.',
 'normal', 20),

(NULL, 'vagmarken',
 'Vad innebär en gul rektangulärt vägmärke med svart text "30"?',
 '[
   {"text": "Obligatorisk hastighet 30 km/h i detta område",              "is_correct": false},
   {"text": "Rekommenderad hastighet 30 km/h i en kurva eller liknande",  "is_correct": true},
   {"text": "Hastighetsbegränsning 30 km/h gäller",                       "is_correct": false},
   {"text": "Varning — hastighetskontroll 30 meter framåt",               "is_correct": false}
 ]'::jsonb,
 'Det gula märket med siffra är en rekommenderad hastighet — inte ett förbud. Det anger en lämplig hastighet för den aktuella vägmiljön, t.ex. i en skarp kurva.',
 'hard', 20),

(NULL, 'vagmarken',
 'Vad innebär ett vägmärke med en röd triangel och en svart pil som svänger?',
 '[
   {"text": "Obligatorisk sväng framåt",                                   "is_correct": false},
   {"text": "Varning för kurva åt det håll pilen pekar",                  "is_correct": true},
   {"text": "Rekommenderad körriktning i en rondell",                     "is_correct": false},
   {"text": "Vägen tar slut — vändplats framåt",                          "is_correct": false}
 ]'::jsonb,
 'Varningstriangel med kurvad pil varnar för en kurva i den riktning pilen pekar. Vid kraftig kurva eller skarpt krök kan det finnas ytterligare vägmärke. Anpassa hastigheten i förväg.',
 'easy', 20),

(NULL, 'vagmarken',
 'Vad innebär en röd cirkel med en svart bil och ett kryss (X)?',
 '[
   {"text": "Förbud mot genomfartskörning med bil",             "is_correct": false},
   {"text": "Parkeringsförbud för bilar",                       "is_correct": false},
   {"text": "Förbud mot trafik med motorfordon",                "is_correct": true},
   {"text": "Mötesförbud — enkelriktad trafik framåt",          "is_correct": false}
 ]'::jsonb,
 'Förbudsmärket med motorfordon och kryss innebär att trafik med motordrivna fordon är förbjuden på denna väg. Cykel och gång kan vara tillåtet.',
 'normal', 20),

-- ════════════════════════════════════════════════════════════════════════════
-- Miljö & Ekonomi — additional 10 questions
-- ════════════════════════════════════════════════════════════════════════════

(NULL, 'miljo',
 'Hur påverkar tomgångskörning bränsleförbrukning och miljö?',
 '[
   {"text": "Tomgång förbrukar minimal bränsle och har ingen praktisk miljöpåverkan",        "is_correct": false},
   {"text": "Tomgångskörning i mer än 1 minut förbrukar mer bränsle än att starta om motorn", "is_correct": true},
   {"text": "Tomgång värmer upp motorn snabbare och bör alltid göras i 5 min på vintern",   "is_correct": false},
   {"text": "Tomgång är bra för bränslesystemet och bör göras dagligen",                    "is_correct": false}
 ]'::jsonb,
 'Om du ska stanna mer än 1 minut är det mer bränsleekonomiskt att stänga av motorn. Modern bränsleinsprutning gör att uppstarten förbrukar lite bränsle jämfört med lång tomgångskörning.',
 'normal', 20),

(NULL, 'miljo',
 'Vilket körsätt är mest bränslesnålt i stadstrafik?',
 '[
   {"text": "Accelerera snabbt till önskad hastighet och bromsa hårt vid behov",         "is_correct": false},
   {"text": "Förutse trafiken, rulla av med lyftt fot och accelerera mjukt",             "is_correct": true},
   {"text": "Hålla konstant låg hastighet utan att bromsa eller accelerera",             "is_correct": false},
   {"text": "Alltid använda lägsta möjliga växel för maximal motorbroms",               "is_correct": false}
 ]'::jsonb,
 'Förutseende körning — rulla av tidigt mot rött ljus och accelerera mjukt — minskar bränsleförbrukningen med upp till 25% jämfört med aggressiv körning.',
 'normal', 20),

(NULL, 'miljo',
 'Vad är "eco-driving" (sparsam körning) i första hand?',
 '[
   {"text": "Att alltid köra under hastighetsgränsen med 20 km/h",              "is_correct": false},
   {"text": "Att köra med lägsta möjliga motorvarvtal och bränsleförbrukning",   "is_correct": true},
   {"text": "Att aldrig använda luftkonditionering",                             "is_correct": false},
   {"text": "Att planera rutten för att undvika alla höjdskillnader",            "is_correct": false}
 ]'::jsonb,
 'Eco-driving handlar om att framföra fordonet på ett sätt som minimerar bränsleförbrukning och utsläpp — tidig uppväxling, jämn hastighet, förutseende körning och lämplig hastighet.',
 'easy', 20),

(NULL, 'miljo',
 'Hur mycket mer bränsle förbrukar luftkonditioneringen (AC) i genomsnitt?',
 '[
   {"text": "Det är försumbart — under 1%",     "is_correct": false},
   {"text": "5–15% ökad bränsleförbrukning",    "is_correct": true},
   {"text": "30–40% ökad bränsleförbrukning",   "is_correct": false},
   {"text": "AC har ingen påverkan på bensinmotorer", "is_correct": false}
 ]'::jsonb,
 'Luftkonditioneringen belastar motorn och ökar bränsleförbrukningen med 5–15% beroende på utomhustemperatur, solstrålning och inställd temperatur.',
 'normal', 20),

(NULL, 'miljo',
 'Vilken körhastighet ger vanligtvis lägst bränsleförbrukning per mil på motorväg?',
 '[
   {"text": "60 km/h",   "is_correct": false},
   {"text": "80–90 km/h", "is_correct": true},
   {"text": "100 km/h",  "is_correct": false},
   {"text": "120 km/h",  "is_correct": false}
 ]'::jsonb,
 'De flesta bensinmotorer är mest effektiva kring 80–90 km/h på motorväg. Under denna hastighet är effektiviteten lägre, och over 90 km/h ökar luftmotståndet kraftigt.',
 'hard', 20),

(NULL, 'miljo',
 'Vad händer med bränsleförbrukningen om du kör med 100 kg extra last?',
 '[
   {"text": "Ingenting — lastens vikt påverkar inte bränslet",        "is_correct": false},
   {"text": "Den minskar — tyngre bilar rullar bättre",               "is_correct": false},
   {"text": "Den ökar med ungefär 5% per 100 kg extra last",          "is_correct": true},
   {"text": "Den ökar med 30–40% per 100 kg extra last",              "is_correct": false}
 ]'::jsonb,
 'Varje extra 100 kg i fordonet ökar bränsleförbrukningen med ca 5%. Rensa bilen från onödig last — cyklar på cykelstativ, verktyg och utrustning som inte behövs.',
 'normal', 20),

(NULL, 'miljo',
 'Hur bör du värma upp bilen på vintern för bäst bränsleekonomi och miljö?',
 '[
   {"text": "Låt motorn gå på tomgång i 10–15 minuter innan start",          "is_correct": false},
   {"text": "Kör igång direkt men kör försiktigt tills motorn värmt upp",    "is_correct": true},
   {"text": "Starta och gasa hårt för att snabbt värma upp motorn",          "is_correct": false},
   {"text": "Värm aldrig upp motorn — det skadar katalysatorn",              "is_correct": false}
 ]'::jsonb,
 'Modern motorer behöver inte långa uppvärmningstider. Kör igång direkt men kör varsamt de första kilometrarna. Lång tomgångskörning ökar bränsleförbrukning och utsläpp.',
 'normal', 20),

(NULL, 'miljo',
 'Vad är "regenerativ bromsning" i ett elfordon?',
 '[
   {"text": "En teknik för att snabbt bromsa utan att slita på bromsbelägg",                  "is_correct": false},
   {"text": "Att bromskraft omvandlas till elektricitet och lagras i batteriet",               "is_correct": true},
   {"text": "En metod för att kyla bromsskivorna med kylarvätska",                             "is_correct": false},
   {"text": "Att el från batteriet hjälper hydraulbromsarna",                                  "is_correct": false}
 ]'::jsonb,
 'Regenerativ bromsning innebär att elmotorn fungerar som generator vid inbromsning. Rörelseenergin omvandlas till elektricitet och lagras i batteriet, vilket ökar räckvidden.',
 'hard', 20),

(NULL, 'miljo',
 'Hur ska du helst tänka kring rutten när du kör miljösmart?',
 '[
   {"text": "Välj alltid kortaste vägen i kilometer",                                        "is_correct": false},
   {"text": "Välj snabbaste vägen oavsett hastighet",                                        "is_correct": false},
   {"text": "Kombinera ärenden, undvik rusningstrafik och välj vägar utan stopp",            "is_correct": true},
   {"text": "Undvik motorvägar — lägre hastighet ger alltid lägre förbrukning",              "is_correct": false}
 ]'::jsonb,
 'Att kombinera ärenden i samma resa, undvika rusningstrafik och välja vägar med flödande trafik minskar total bränsleförbrukning mer än att enbart fokusera på kortaste sträcka.',
 'normal', 20),

(NULL, 'miljo',
 'Vad är den ungefärliga andelen CO₂-utsläpp från vägtransporter av Sveriges totala utsläpp?',
 '[
   {"text": "Under 5%",    "is_correct": false},
   {"text": "Ungefär 30%", "is_correct": true},
   {"text": "Ungefär 60%", "is_correct": false},
   {"text": "Ungefär 80%", "is_correct": false}
 ]'::jsonb,
 'Vägtransporter svarar för ungefär 30% av Sveriges totala växthusgasutsläpp, vilket gör transportsektorn till en av de största källorna till klimatpåverkan.',
 'hard', 20),

-- ════════════════════════════════════════════════════════════════════════════
-- Fordon & Teknik — additional 10 questions
-- ════════════════════════════════════════════════════════════════════════════

(NULL, 'fordon',
 'Vad gör ESP (Electronic Stability Program) i bilen?',
 '[
   {"text": "Reglerar motorns effekt för jämnare acceleration",                            "is_correct": false},
   {"text": "Hjälper till att hålla bilen stabil vid underskjutning eller överskjutning", "is_correct": true},
   {"text": "Håller automatisk bromsavstånd till framförande fordon",                      "is_correct": false},
   {"text": "Reglerar däcktrycket automatiskt under körning",                              "is_correct": false}
 ]'::jsonb,
 'ESP detekterar när bilen börjar glida eller förlora styrning och bromsar enskilda hjul för att rätta upp fordonet. Det reducerar kraftigt risken för olyckor i halt väglag och vid plötsliga manövrar.',
 'normal', 30),

(NULL, 'fordon',
 'När är det obligatoriskt att använda vinterdäck i Sverige?',
 '[
   {"text": "Från den 1 oktober till den 31 mars oavsett väglag",      "is_correct": false},
   {"text": "När det finns snö, is eller frost på vägen (1 dec–31 mars som riktlinje)", "is_correct": true},
   {"text": "Vinterdäck är aldrig obligatoriska — de är frivilliga",   "is_correct": false},
   {"text": "Bara på vägar norr om Dalälven",                          "is_correct": false}
 ]'::jsonb,
 'Vinterdäck (eller sommardäck med minst 3 mm mönsterdjup godkänt för vinterkörning) är obligatoriska i Sverige vid vinterväglag (snö, is, frost). Perioden är formellt 1 december–31 mars men gäller vid faktiskt vinterväglag.',
 'normal', 30),

(NULL, 'fordon',
 'Vad innebär det om oljevarningslampan tänds under körning?',
 '[
   {"text": "Det är dags för nästa oljebyte inom 1 000 km",                         "is_correct": false},
   {"text": "Oljenivån kan vara för låg eller oljetrycket för lågt — stanna omgående", "is_correct": true},
   {"text": "Motoroljan behöver värmas upp — kör ytterligare 5 km",                  "is_correct": false},
   {"text": "Oljan är gammal men bilen kan köras tills service",                      "is_correct": false}
 ]'::jsonb,
 'Om oljevarningslampan (oljekanna) tänds under körning indikerar det lågt oljetryck eller oljenivå — ett kritiskt tillstånd. Stanna säkert och kontrollera oljenivån. Kör aldrig vidare med tänd oljelampa.',
 'hard', 30),

(NULL, 'fordon',
 'Vad är syftet med katalysatorn i en bensinbil?',
 '[
   {"text": "Att öka motorns effekt och bränsleekonomin",                                    "is_correct": false},
   {"text": "Att omvandla skadliga avgaser (CO, NOx, HC) till koldioxid, vatten och kväve", "is_correct": true},
   {"text": "Att filtrera partiklar ur avgaserna",                                           "is_correct": false},
   {"text": "Att kyla avgaserna innan de lämnar avgassystemet",                              "is_correct": false}
 ]'::jsonb,
 'Katalysatorn är ett avgasreningssystem som omvandlar kolmonoxid (CO), kolvätena (HC) och kväveoxiderna (NOx) till koldioxid (CO₂), vatten (H₂O) och kvävgas (N₂).',
 'hard', 30),

(NULL, 'fordon',
 'Hur vet du att ditt fordon har ett punkterat däck under körning?',
 '[
   {"text": "Bilen börjar lukta gummi",                                               "is_correct": false},
   {"text": "Bilen drar åt ena sidan, vibrerar eller rattet rycker",                 "is_correct": true},
   {"text": "Motorn börjar stanna",                                                   "is_correct": false},
   {"text": "Bara om TPMS-lampan lyser",                                              "is_correct": false}
 ]'::jsonb,
 'Vid punktering märker du vanligtvis att bilen drar mot sidan med punkteringen, vibrationer i rattet, eller att bilen känns tyngre att styra. Stanna säkert och kontrollera däcken.',
 'normal', 30),

(NULL, 'fordon',
 'Vad innebär "dubbdäck" och när används de?',
 '[
   {"text": "Däck med extra tjock slitbana — används sommartid för bättre grepp",    "is_correct": false},
   {"text": "Vinterdäck med metallpiggar för bättre grepp på is och packad snö",     "is_correct": true},
   {"text": "Däck med dubbla luftkamrar — förhindrar total punktering",              "is_correct": false},
   {"text": "Specialdäck för fordon som transporterar tung last",                    "is_correct": false}
 ]'::jsonb,
 'Dubbdäck är vinterdäck försedda med metallpiggar (dubbar) som griper in i is och packad snö för bättre grepp. De är tillåtna i Sverige 1 oktober–15 april (med variationer).',
 'easy', 30),

(NULL, 'fordon',
 'Hur kontrollerar du att dina bromsljus fungerar utan hjälp?',
 '[
   {"text": "Det är omöjligt att kontrollera utan hjälp",                           "is_correct": false},
   {"text": "Backa in mot en vägg och kontrollera reflektionen",                    "is_correct": true},
   {"text": "Kör och lyssna på ljudet från bromsarna",                              "is_correct": false},
   {"text": "Kontrollera instrumentpanelen för bromsljusets indikator",             "is_correct": false}
 ]'::jsonb,
 'Du kan kontrollera bromsljusen ensam genom att backa nära en reflekerande yta (t.ex. en garageport) och kontrollera att det röda ljuset syns i reflektionen när du trycker på bromsen.',
 'normal', 30),

(NULL, 'fordon',
 'Vad ska du göra om styrningen plötsligt känns tung under körning?',
 '[
   {"text": "Öka hastigheten — det hjälper servostyrningen",                           "is_correct": false},
   {"text": "Ignorera det och kör till närmaste verkstad på normal hastighet",         "is_correct": false},
   {"text": "Stanna säkert — servostyrningen kan ha gått sönder eller sladden kunna smita", "is_correct": true},
   {"text": "Sänka hastigheten men fortsätta körningen är helt säkert",                "is_correct": false}
 ]'::jsonb,
 'Tung styrning kan indikera att servostyrningen slutat fungera eller att ett däck punkterat. Bilen kan fortfarande styras men kräver mer kraft. Stanna säkert och undersök orsaken.',
 'hard', 30),

(NULL, 'fordon',
 'Vad är syftet med varningstriangeln (reflextriangeln) som ska finnas i alla bilar?',
 '[
   {"text": "Att mäta avstånd till vägkanten vid parkering",                        "is_correct": false},
   {"text": "Att varna annan trafik om ett stannat eller havererat fordon",         "is_correct": true},
   {"text": "Att ge signal till motorcyklister att hålla avstånd",                  "is_correct": false},
   {"text": "Att användas istället för blinkers vid filbyte på motorväg",           "is_correct": false}
 ]'::jsonb,
 'Varningstriangeln placeras ut bakom ett havererat fordon på tillräckligt avstånd (minst 100 m på motorväg) för att varna ankommande trafik i god tid.',
 'easy', 30),

(NULL, 'fordon',
 'Hur kontrollerar du motoroljenivån på ett traditionellt sätt?',
 '[
   {"text": "Se avläsningen i fordonets instrumentpanel",                                     "is_correct": false},
   {"text": "Torka av oljemätstickan, sätt i den igen och läs av nivån mot MIN/MAX-markeringarna", "is_correct": true},
   {"text": "Dra ut oljepåfyllningslocket och titta in i motorn",                             "is_correct": false},
   {"text": "Kontrollera oljeförbrukning via bilens dator",                                   "is_correct": false}
 ]'::jsonb,
 'Torka av mätstickan med en trasa, sätt i den fullt, dra ut igen och kontrollera att oljenivån är mellan MIN och MAX. Kontrollera när motorn är kall eller minst 5 minuter efter att motorn stängts av.',
 'easy', 30),

-- ════════════════════════════════════════════════════════════════════════════
-- Riskhantering — additional 10 questions
-- ════════════════════════════════════════════════════════════════════════════

(NULL, 'riskhantering',
 'Vad är "aquaplaning" (vattenplaning) och hur undviker du det?',
 '[
   {"text": "När bilen glider på is — undvik genom att bromsa hårt",                              "is_correct": false},
   {"text": "När däcken lyfter från vägbanan på ett vattenfilter — undvik med lägre hastighet och bra däck", "is_correct": true},
   {"text": "När broms överhettats av vatten — undvik genom att torrtesta bromsarna",              "is_correct": false},
   {"text": "Motoröversvämning vid djupt vatten — undvik motorvägar vid regn",                    "is_correct": false}
 ]'::jsonb,
 'Aquaplaning uppstår när däcken glider upp på ett vattenfilter och förlorar kontakt med vägytan. Sänk hastigheten i regn, se till att däcken har tillräckligt mönsterdjup och undvik kraftiga styrmanövrar.',
 'normal', 40),

(NULL, 'riskhantering',
 'Vad är den döda vinkeln (blinda fläcken) och hur hanterar du den?',
 '[
   {"text": "Området framför bilen som inte syns vid starkt solljus — använd solskydd",        "is_correct": false},
   {"text": "Utrymmet vid sidan av bilen som inte syns i speglar — kontrollera med en blick",  "is_correct": true},
   {"text": "Området under bilen där fotgängare kan gömma sig",                               "is_correct": false},
   {"text": "Siktbegränsning bakåt orsakad av bakrutans lutning",                             "is_correct": false}
 ]'::jsonb,
 'Den döda vinkeln är ytan vid sidan och bakåt som inte täcks av backspeglar. Innan filbyte eller sväng — ta en snabb blick bakåt och åt sidan. Backsensorer och kameror kan hjälpa men ersätter inte den manuella kontrollen.',
 'normal', 40),

(NULL, 'riskhantering',
 'Vad bör du göra om du känner att du tappar kontrollen över bilen (sladdar)?',
 '[
   {"text": "Bromsa hårt och ratt rakt",                                                "is_correct": false},
   {"text": "Styr mjukt mot sladdens riktning och undvik hård bromsning",               "is_correct": true},
   {"text": "Accelerera kraftigt för att komma ur sladden",                             "is_correct": false},
   {"text": "Dra åt handbromsen för att snabbt stoppa sladden",                        "is_correct": false}
 ]'::jsonb,
 'Vid sladd: styr lugnt mot det håll bilen glider (motkorrigera), undvik hård bromsning som kan förvärra situationen, och gas av mjukt. Hård bromsning och käftiga rattmanövrar gör sladden värre.',
 'hard', 40),

(NULL, 'riskhantering',
 'Hur påverkar vanliga smärtstillande läkemedel (t.ex. Alvedon/paracetamol) körförmågan?',
 '[
   {"text": "De påverkar inte körförmågan alls",                                             "is_correct": false},
   {"text": "De kan orsaka trötthet och nedsatt reaktionsförmåga hos vissa individer",      "is_correct": true},
   {"text": "De förbättrar fokus och reaktionstid",                                         "is_correct": false},
   {"text": "Bara receptbelagda mediciner påverkar körförmågan",                            "is_correct": false}
 ]'::jsonb,
 'Många receptfria läkemedel — inklusive vissa smärtstillande och antihistaminer — kan orsaka dåsighet eller nedsatt reaktionsförmåga. Läs alltid bipacksedeln och rådfråga apotek vid tveksamhet.',
 'normal', 40),

(NULL, 'riskhantering',
 'Vad bör du göra om ett djur plötsligt springer ut på vägen?',
 '[
   {"text": "Alltid svänga för att undvika djuret — det är viktigare än att hålla körfältet",  "is_correct": false},
   {"text": "Bromsa kontrollerat och håll rätt i kursen — undvik plötsliga undanmanövrar",     "is_correct": true},
   {"text": "Tuta kraftigt och öka hastigheten för att skrämma bort djuret",                   "is_correct": false},
   {"text": "Kör förbi djuret på vägrenen",                                                    "is_correct": false}
 ]'::jsonb,
 'Bromsa kontrollerat och håll kursen. Plötsliga undanmanövrar kan orsaka tappad kontroll, vältning eller kollision med mötande trafik. Träff med djur är ofta farligare än alternativet att hålla kvar bilen i körfältet.',
 'hard', 40),

(NULL, 'riskhantering',
 'Hur lång tid tar det genomsnittligt för reaktion och inbromsning vid 90 km/h?',
 '[
   {"text": "Ungefär 20 meter",                              "is_correct": false},
   {"text": "Ungefär 50–70 meter (reaktion + bromsväg)",    "is_correct": true},
   {"text": "Ungefär 100–120 meter",                        "is_correct": false},
   {"text": "Bromssträckan beror bara på däckkvalitet",     "is_correct": false}
 ]'::jsonb,
 'Vid 90 km/h innebär 1 sekund reaktionstid ca 25 meter (reaktionssträcka), plus bromsvägen ger totalt ca 50–70 meter under normala förhållanden. I halt väglag kan det dubbleras.',
 'hard', 40),

(NULL, 'riskhantering',
 'Vad är "hallucination vid körning" (mikrosomnolens) och hur farligt är det?',
 '[
   {"text": "En ovanlig reaktion på starkt solljus — förhindra med solglasögon",     "is_correct": false},
   {"text": "Korta sömnintervall på några sekunder under körning — extremt farligt",  "is_correct": true},
   {"text": "Syn-illusioner som uppstår vid snabb körning i mörker",                 "is_correct": false},
   {"text": "Förvirring om vilken väg du ska ta — förebygg med GPS",                 "is_correct": false}
 ]'::jsonb,
 'Mikrosomnolens (sekundssömn) innebär att hjärnan stänger av sig i 2–30 sekunder. Vid 90 km/h tillryggalägger du 50 meter eller mer totalt omedveten. Det är livsfarligt och det enda motmedlet är att stanna och vila.',
 'hard', 40),

(NULL, 'riskhantering',
 'Vad ska du göra om ett motgående fordon kör med helljusen tända och bländar dig?',
 '[
   {"text": "Blinkar kraftigt med helljus för att signalera till den andre föraren",    "is_correct": false},
   {"text": "Titta mot höger vägkant och sakta ned",                                   "is_correct": true},
   {"text": "Stanna bilen omedelbart mitt i körfältet",                                "is_correct": false},
   {"text": "Stäng ögonen tills bilen passerat",                                       "is_correct": false}
 ]'::jsonb,
 'Vid bländning: titta mot höger vägkant (inte direkt in i ljuset), sakta ned och håll bilen stabil i körfältet. Stäng inte ögonen och gör inga kraftiga rattmanövrar.',
 'normal', 40),

(NULL, 'riskhantering',
 'Vilken av dessa faktorer förstärker risken för trafikolycka mest?',
 '[
   {"text": "Att köra med radio igång",                                                "is_correct": false},
   {"text": "Kombinationen av hög hastighet, alkohol och trötthet",                   "is_correct": true},
   {"text": "Att köra en äldre bil utan Bluetooth",                                   "is_correct": false},
   {"text": "Att köra på en motorväg utan vägbelysning",                              "is_correct": false}
 ]'::jsonb,
 'Kombinationen av hög hastighet, alkohol/droger och trötthet utgör de tre mest avgörande riskfaktorerna för allvarliga trafikolyckor. Var och en är farlig — kombinationen är extremt farlig.',
 'normal', 40),

(NULL, 'riskhantering',
 'Vad ska du göra om dina bromsar oväntat slutar fungera under körning?',
 '[
   {"text": "Hoppa ur bilen om du inte överstiger 30 km/h",                                      "is_correct": false},
   {"text": "Pumpa bromspedalen, växla ned, använd motorbroms och handbromsen försiktigt",        "is_correct": true},
   {"text": "Öka hastigheten för att snabbt nå ett område med väggrepp",                         "is_correct": false},
   {"text": "Stäng av tändningen omedelbart",                                                    "is_correct": false}
 ]'::jsonb,
 'Bromsbortfall: pumpa bromspedalen (kan återställa hydraultryck), växla ned sekventiellt för motorbroms, och dra åt handbromsen försiktigt och progressivt. Styr mot ett säkert stopp (grushög, vägkant). Stäng aldrig av tändningen under körning — det låser rattet.',
 'hard', 40)

ON CONFLICT (category, question_text) WHERE organization_id IS NULL DO NOTHING;
