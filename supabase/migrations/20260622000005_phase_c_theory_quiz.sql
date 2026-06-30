-- ════════════════════════════════════════════════════════════════════════════
-- Phase C: Theory Course Management
--
-- Creates a quiz engine for Swedish driving theory preparation:
--
--   quiz_questions       — org-specific or system-wide question bank
--   quiz_sessions        — one row per quiz attempt by a student
--   quiz_session_answers — individual question answers within a session
--
-- Seeds 25 system-wide Swedish theory questions (5 per category).
-- System questions (organization_id IS NULL) are visible to all orgs.
--
-- Categories:
--   trafikregler    — traffic rules
--   vagmarken       — road signs
--   miljo           — eco/economy driving
--   fordon          — vehicle knowledge
--   riskhantering   — hazard perception / risk management
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. quiz_questions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid             REFERENCES organizations(id),  -- NULL = system-wide
  category        text NOT NULL,
  question_text   text NOT NULL,
  -- [{text: string, is_correct: boolean}]  — exactly one element has is_correct=true
  options         jsonb NOT NULL,
  explanation     text,
  difficulty      text NOT NULL DEFAULT 'normal'
                    CHECK (difficulty IN ('easy', 'normal', 'hard')),
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE quiz_questions IS
  'Driving theory quiz questions. organization_id IS NULL = system-wide template visible to all orgs.';

CREATE INDEX IF NOT EXISTS quiz_questions_org_category_idx
  ON quiz_questions(organization_id, category)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS quiz_questions_system_category_idx
  ON quiz_questions(category)
  WHERE organization_id IS NULL AND is_active = true;

DROP TRIGGER IF EXISTS quiz_questions_set_updated_at ON quiz_questions;
CREATE TRIGGER quiz_questions_set_updated_at
  BEFORE UPDATE ON quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's questions + system questions
CREATE POLICY quiz_questions_tenant_read ON quiz_questions
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = (
      current_setting('request.jwt.claims', true)::jsonb->>'organization_id'
    )::uuid
  );

-- Staff with settings:write can manage their org's questions
CREATE POLICY quiz_questions_tenant_write ON quiz_questions
  FOR ALL TO authenticated
  USING (
    organization_id = (
      current_setting('request.jwt.claims', true)::jsonb->>'organization_id'
    )::uuid
  )
  WITH CHECK (
    organization_id = (
      current_setting('request.jwt.claims', true)::jsonb->>'organization_id'
    )::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON quiz_questions TO authenticated;
GRANT ALL ON quiz_questions TO service_role;

-- ── 2. quiz_sessions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  student_id      uuid NOT NULL REFERENCES students(id),
  category        text,               -- NULL = mixed categories
  question_count  int  NOT NULL,
  score           int,                -- correct answers; NULL until submitted
  completed_at    timestamptz,        -- NULL if still in progress
  time_spent_sec  int,                -- seconds from start to submission
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE quiz_sessions IS
  'One row per quiz attempt. score is set when the student submits.';

CREATE INDEX IF NOT EXISTS quiz_sessions_student_idx
  ON quiz_sessions(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quiz_sessions_org_idx
  ON quiz_sessions(organization_id, created_at DESC);

ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

-- Staff can read sessions for their org
CREATE POLICY quiz_sessions_tenant_read ON quiz_sessions
  FOR SELECT TO authenticated
  USING (
    organization_id = (
      current_setting('request.jwt.claims', true)::jsonb->>'organization_id'
    )::uuid
  );

GRANT SELECT ON quiz_sessions TO authenticated;
GRANT ALL    ON quiz_sessions TO service_role;

-- ── 3. quiz_session_answers ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_session_answers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES quiz_sessions(id),
  question_id    uuid NOT NULL REFERENCES quiz_questions(id),
  selected_index int,       -- 0-based index into options array; NULL if skipped
  is_correct     boolean,
  answered_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_session_answers_session_idx
  ON quiz_session_answers(session_id);

ALTER TABLE quiz_session_answers ENABLE ROW LEVEL SECURITY;

GRANT ALL ON quiz_session_answers TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. System-wide Swedish Theory Questions (organization_id = NULL)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO quiz_questions
  (organization_id, category, question_text, options, explanation, difficulty)
VALUES

-- ── Trafikregler (5 questions) ────────────────────────────────────────────────

(NULL, 'trafikregler',
 'Vad är den normala hastighetsbegränsningen på en motorväg i Sverige?',
 '[
   {"text": "90 km/h",  "is_correct": false},
   {"text": "100 km/h", "is_correct": false},
   {"text": "110 km/h", "is_correct": false},
   {"text": "120 km/h", "is_correct": true}
 ]'::jsonb,
 'På svenska motorvägar är den normala hastighetsbegränsningen 120 km/h, om inte annat anges med vägmärken.',
 'easy'),

(NULL, 'trafikregler',
 'Vad gäller vid ett övergångsställe utan trafikljus?',
 '[
   {"text": "Fordon har alltid företräde",                                  "is_correct": false},
   {"text": "Fotgängare har alltid företräde oavsett om de är på körbanan", "is_correct": false},
   {"text": "Den som är närmast övergångsstället har företräde",            "is_correct": false},
   {"text": "Fordon ska ge fotgängare som är på väg ut på övergångsstället företräde", "is_correct": true}
 ]'::jsonb,
 'Enligt trafiklagen ska förare ge fotgängare som är på väg ut på, eller som befinner sig på övergångsstället, företräde.',
 'normal'),

(NULL, 'trafikregler',
 'Vilket minimiavstånd bör du hålla till bilen framför under normala körförhållanden?',
 '[
   {"text": "Minst en sekunds avstånd",   "is_correct": false},
   {"text": "Minst två sekunders avstånd","is_correct": true},
   {"text": "Minst tre sekunders avstånd","is_correct": false},
   {"text": "Minst fyra sekunders avstånd","is_correct": false}
 ]'::jsonb,
 'Tumregeln är att hålla minst 2 sekunders avstånd till framförvarande fordon. Vid dåliga vägförhållanden bör du hålla ännu längre avstånd.',
 'normal'),

(NULL, 'trafikregler',
 'När ska helljus (lång belysning) användas vid körning utanför tättbebyggt område i mörker?',
 '[
   {"text": "Alltid vid körning i mörker utan undantag",                "is_correct": false},
   {"text": "Aldrig — halvljus räcker alltid",                          "is_correct": false},
   {"text": "När det inte finns mötande trafik som kan bländas",        "is_correct": true},
   {"text": "Bara när sikten är under 50 meter",                        "is_correct": false}
 ]'::jsonb,
 'Helljus ska användas i mörker när det inte finns mötande trafik eller trafik precis framför dig som kan bländas. Byt till halvljus i god tid när du möter andra fordon.',
 'normal'),

(NULL, 'trafikregler',
 'Vad gäller vid körning i en cirkulationsplats (rondell) utan vägmärken?',
 '[
   {"text": "Trafiken i rondellen har alltid väjningsplikt mot inkommande trafik", "is_correct": false},
   {"text": "Inkommande trafik har väjningsplikt mot trafiken i rondellen",        "is_correct": true},
   {"text": "Trafik från höger har alltid företräde",                              "is_correct": false},
   {"text": "Det beror på fordonets storlek — tyngre fordon har företräde",        "is_correct": false}
 ]'::jsonb,
 'Vid en cirkulationsplats gäller att inkommande trafik (de som ska in i rondellen) ska väja för den trafik som redan befinner sig i cirkulationsplatsen.',
 'normal'),

-- ── Vägmärken (5 questions) ───────────────────────────────────────────────────

(NULL, 'vagmarken',
 'Vad innebär ett rött åttkantigt stoppskylten (STOP)?',
 '[
   {"text": "Sänk hastigheten och kör vidare om vägen är fri",     "is_correct": false},
   {"text": "Stanna helt och ge väj för annan trafik",             "is_correct": true},
   {"text": "Håll nere hastigheten till 30 km/h",                  "is_correct": false},
   {"text": "Ge väj för trafik från höger",                        "is_correct": false}
 ]'::jsonb,
 'Stoppskylten kräver att du stannar fullständigt (0 km/h) och ger väj för all annan trafik innan du kör vidare.',
 'easy'),

(NULL, 'vagmarken',
 'Vilket vägmärke visar att du befinner dig på en prioriterad väg?',
 '[
   {"text": "En röd triangel pekande nedåt",      "is_correct": false},
   {"text": "En gul romb med vit kant",            "is_correct": true},
   {"text": "En blå cirkel med vit pil",           "is_correct": false},
   {"text": "En röd cirkel med diagonalt streck",  "is_correct": false}
 ]'::jsonb,
 'Den gula romben med vit kant (väjningsplikts upphörande) visar att du kör på en prioriterad väg. Korsande trafik ska ge dig väj.',
 'normal'),

(NULL, 'vagmarken',
 'Vad anger ett blått rektangulärt vägmärke med ett vitt "P"?',
 '[
   {"text": "Här är det förbjudet att parkera",                             "is_correct": false},
   {"text": "Här är det tillåtet att parkera",                             "is_correct": true},
   {"text": "Här är det tillåtet att stanna men inte parkera",             "is_correct": false},
   {"text": "Parkeringsplats för fordon med parkeringstillstånd",          "is_correct": false}
 ]'::jsonb,
 'Den blå parkeringsskylten (P) anger att parkering är tillåten, ofta med tidsbegränsning eller andra villkor angivna under skylten.',
 'easy'),

(NULL, 'vagmarken',
 'Vad innebär en röd triangel med ett utropstecken "!" i Sverige?',
 '[
   {"text": "Varning för farlig kurva",                                       "is_correct": false},
   {"text": "Allmän varning — fara som inte har en specifik skylt",           "is_correct": true},
   {"text": "Varning — barn leker i närheten",                               "is_correct": false},
   {"text": "Obligatorisk stopp för kontroll",                               "is_correct": false}
 ]'::jsonb,
 'Triangeln med utropstecken är en allmän varningsskylt som används vid faror utan specifik skylt. Var extra uppmärksam och sänk hastigheten.',
 'normal'),

(NULL, 'vagmarken',
 'Vad innebär en röd cirkel med siffran 50 på en vit bakgrund?',
 '[
   {"text": "Rekommenderad hastighet: 50 km/h",                      "is_correct": false},
   {"text": "Forbudsskylt: max 50 km/h gäller från denna punkt",     "is_correct": true},
   {"text": "Minsta tillåtna hastighet: 50 km/h",                    "is_correct": false},
   {"text": "Hastighetskontroll pågår inom 50 meter",                "is_correct": false}
 ]'::jsonb,
 'En röd cirkel med hastighetssiffra är ett förbudsmärke som anger maximal tillåten hastighet från skylten och framåt tills ett nytt hastighetsmärke visas.',
 'easy'),

-- ── Miljö & Ekonomi (5 questions) ─────────────────────────────────────────────

(NULL, 'miljo',
 'Vilket av dessa körsätt sparar mest bränsle på motorväg?',
 '[
   {"text": "Köra i så hög hastighet som möjligt för att komma fort fram",             "is_correct": false},
   {"text": "Hålla en jämn hastighet och förutse trafiksituationen",                   "is_correct": true},
   {"text": "Bromsa hårt och sedan accelerera kraftigt (pump-accelerering)",           "is_correct": false},
   {"text": "Hålla motorn på högt varvtal i låg växel",                               "is_correct": false}
 ]'::jsonb,
 'Jämn och förutseende körning är det effektivaste sättet att spara bränsle. Onödiga accelerationer och inbromsningar ökar bränsleförbrukningen avsevärt.',
 'normal'),

(NULL, 'miljo',
 'Vad händer med bränsleförbrukningen om du ökar hastigheten från 90 till 110 km/h?',
 '[
   {"text": "Den ökar med ungefär 25%",                "is_correct": true},
   {"text": "Den minskar något eftersom du kör fortare och sparar tid", "is_correct": false},
   {"text": "Den ökar med ungefär 5%",                 "is_correct": false},
   {"text": "Hastigheten påverkar inte förbrukningen",  "is_correct": false}
 ]'::jsonb,
 'Luftmotståndet ökar kvadratiskt med hastigheten. Att öka från 90 till 110 km/h kan öka bränsleförbrukningen med 25% eller mer.',
 'hard'),

(NULL, 'miljo',
 'Vilket däcktryck är bäst för bränsleekonomin?',
 '[
   {"text": "Lägre än tillverkarens rekommendation för bättre väggrepp",   "is_correct": false},
   {"text": "Exakt tillverkarens rekommenderade tryck eller något högre",  "is_correct": true},
   {"text": "Maximalt möjliga trycket",                                    "is_correct": false},
   {"text": "Det spelar ingen roll för bränsleförbrukningen",              "is_correct": false}
 ]'::jsonb,
 'Korrekt däcktryck minimerar rullmotståndet och därigenom bränsleförbrukningen. Underdäckta däck kan öka förbrukningen med 2–3% per 0,5 bar under rekommenderat tryck.',
 'normal'),

(NULL, 'miljo',
 'Vad bör du göra med takboxen när du inte använder den?',
 '[
   {"text": "Lämna den kvar — den påverkar inte bränsleförbrukningen", "is_correct": false},
   {"text": "Ta bort den — den ökar luftmotståndet och förbrukningen",  "is_correct": true},
   {"text": "Fyll den med tung last för att förbättra stabiliteten",   "is_correct": false},
   {"text": "Byt till en mjukare takbox",                              "is_correct": false}
 ]'::jsonb,
 'En tom takbox ökar luftmotståndet och kan höja bränsleförbrukningen med upp till 10%. Ta alltid bort takbox och takräcken när de inte används.',
 'normal'),

(NULL, 'miljo',
 'Vilken av följande metoder minskar ditt fordons koldioxidutsläpp mest?',
 '[
   {"text": "Byta motorolja oftare",                                                    "is_correct": false},
   {"text": "Samåka, använda kollektivtrafik, eller cykla för korta sträckor",         "is_correct": true},
   {"text": "Tvätta bilen oftare för att minska luftmotståndet",                       "is_correct": false},
   {"text": "Byta till bredare däck för bättre vägkontakt",                           "is_correct": false}
 ]'::jsonb,
 'Färre körda mil är det mest effektiva sättet att minska utsläppen. Samåkning, kollektivtrafik och cykling för kortare resor ger störst effekt.',
 'easy'),

-- ── Fordon & Teknik (5 questions) ─────────────────────────────────────────────

(NULL, 'fordon',
 'Vad innebär förkortningen ABS i samband med fordon?',
 '[
   {"text": "Automatiskt Bromssystem med Servostyrning",                              "is_correct": false},
   {"text": "Anti-Blockeringssystem som förhindrar att hjulen låser sig vid inbromsning", "is_correct": true},
   {"text": "Automatisk Bromsanpassning i Svängar",                                  "is_correct": false},
   {"text": "Avancerat Bromsstöd med Sensorer",                                      "is_correct": false}
 ]'::jsonb,
 'ABS (Anti-lock Braking System) förhindrar att hjulen låser sig vid hård inbromsning, vilket gör att du behåller styrförmågan och kan undvika hinder under inbromsning.',
 'easy'),

(NULL, 'fordon',
 'Vilka tre vätskor bör du regelbundet kontrollera för att hålla bilen i gott skick?',
 '[
   {"text": "Motorolja, spolarvätska och bensin",               "is_correct": false},
   {"text": "Motorolja, kylvätska och bromsvätska",             "is_correct": true},
   {"text": "Kraftöverföringsolja, bensin och spolarvätska",    "is_correct": false},
   {"text": "Kylvätska, diesel och servostyrningsolja",         "is_correct": false}
 ]'::jsonb,
 'Motorolja, kylvätska och bromsvätska är de tre viktigaste vätskor att kontrollera regelbundet. Låg nivå eller dålig kvalitet kan leda till allvarliga motorskador eller bromsproblem.',
 'normal'),

(NULL, 'fordon',
 'Vilken är det lägsta lagstadgade mönsterdjupet för sommardäck i Sverige?',
 '[
   {"text": "1,0 mm", "is_correct": false},
   {"text": "1,6 mm", "is_correct": true},
   {"text": "2,0 mm", "is_correct": false},
   {"text": "3,0 mm", "is_correct": false}
 ]'::jsonb,
 'Det lagstadgade minimumdjupet för sommardäck är 1,6 mm i Sverige. Med slitna däck ökar bromssträckan avsevärt och du riskerar böter och ogiltig bilbesiktning.',
 'normal'),

(NULL, 'fordon',
 'Vad innebär det när en varningslampa för motortemperatur tänds under körning?',
 '[
   {"text": "Det är normalt och inget att oroa sig för",                                                "is_correct": false},
   {"text": "Bränslenivån är låg",                                                                      "is_correct": false},
   {"text": "Motorn är överhettad — stanna säkert och stäng av motorn omedelbart",                     "is_correct": true},
   {"text": "Det är dags att byta motorolja",                                                           "is_correct": false}
 ]'::jsonb,
 'En tänd temperaturvarningslampa betyder att motorn riskerar överhettning. Stanna säkert på sidan av vägen och stäng av motorn. Kör aldrig vidare — det kan orsaka allvarliga och kostsamma motorskador.',
 'hard'),

(NULL, 'fordon',
 'Vad bör du göra om bromspedalen känns mjuk och sjunker mot golvet?',
 '[
   {"text": "Pumpa bromsarna snabbt för att återfå trycket och kör vidare",                      "is_correct": false},
   {"text": "Kontrollera bromsvätskans nivå och låt en mekaniker undersöka bromssystemet",       "is_correct": true},
   {"text": "Ingenting — det är normalt för äldre fordon",                                       "is_correct": false},
   {"text": "Byt till lägre växel och använd motorbromsen",                                      "is_correct": false}
 ]'::jsonb,
 'En mjuk eller sjunkande bromspedal kan tyda på läcka i bromssystemet eller att luft kommit in i bromsrören. Låt en mekaniker undersöka bilen omgående — bromsproblem är allvarliga säkerhetsrisker.',
 'hard'),

-- ── Riskhantering (5 questions) ───────────────────────────────────────────────

(NULL, 'riskhantering',
 'Vad är den vanligaste bakomliggande orsaken till trafikolyckor?',
 '[
   {"text": "Dåligt väglag eller halt vägunderlag",                       "is_correct": false},
   {"text": "Mekaniska fel på fordonet",                                  "is_correct": false},
   {"text": "Mänskliga faktorer som ouppmärksamhet, trötthet och stress", "is_correct": true},
   {"text": "Dålig sikt på grund av väderförhållanden",                   "is_correct": false}
 ]'::jsonb,
 'Mänskliga faktorer — ouppmärksamhet, trötthet, stress, hastighet och alkohol — är bakomliggande orsak till de allra flesta trafikolyckor. Tekniska fel och väglag spelar en mindre roll.',
 'normal'),

(NULL, 'riskhantering',
 'Vad är det enda effektiva sättet att hantera trötthet vid ratten?',
 '[
   {"text": "Öppna fönstret och lyssna på hög musik",       "is_correct": false},
   {"text": "Dricka energidryck och köra fortare för att hålla fokus",      "is_correct": false},
   {"text": "Stanna på närmaste rastplats och ta en kort tupplur eller vila", "is_correct": true},
   {"text": "Sänka hastigheten med 20 km/h och köra vidare", "is_correct": false}
 ]'::jsonb,
 'Trötthet vid ratten är extremt farligt. Det enda effektiva motmedlet är att stanna och vila. Musik, frisk luft och koffein kan tillfälligt lindra symtomen men botar inte underliggande trötthet.',
 'normal'),

(NULL, 'riskhantering',
 'Vilken promillegräns gäller för bilförare i Sverige?',
 '[
   {"text": "0,5 promille",  "is_correct": false},
   {"text": "0,3 promille",  "is_correct": false},
   {"text": "0,2 promille",  "is_correct": true},
   {"text": "0,0 promille",  "is_correct": false}
 ]'::jsonb,
 'I Sverige är promillegränsen för rattfylleri 0,2 promille. Redan vid lägre nivåer försämras reaktionsförmåga, riskbedömning och koordination. Det säkraste är att inte dricka alls om du ska köra.',
 'easy'),

(NULL, 'riskhantering',
 'Hur ska du köra när sikten är kraftigt nedsatt av dimma?',
 '[
   {"text": "Sätt på helljus och kör i normal hastighet nära vägrenen",                         "is_correct": false},
   {"text": "Sänk hastigheten, öka säkerhetsavståndet och använd dimljus om sikten är under 100 m", "is_correct": true},
   {"text": "Kör tätt bakom framförande fordon för att se vägen bättre",                        "is_correct": false},
   {"text": "Sätt på varningsblinkers och kör på normal hastighet",                             "is_correct": false}
 ]'::jsonb,
 'I dimma ska du sänka hastigheten, öka säkerhetsavståndet och aktivera dimljusen när sikten understiger 100 meter. Helljus är olämpligt i dimma eftersom det reflekteras och bländar dig.',
 'normal'),

(NULL, 'riskhantering',
 'Vad är du skyldig att göra om du råkar ut för en trafikolycka med personskada?',
 '[
   {"text": "Lämna platsen snabbt för att inte störa räddningsarbetet",               "is_correct": false},
   {"text": "Fotografera olycksplatsen och vänta passivt på polisen",                 "is_correct": false},
   {"text": "Stanna, säkra olycksplatsen, ringa 112, och hjälpa skadade om möjligt", "is_correct": true},
   {"text": "Ringa din försäkring som det första steget",                             "is_correct": false}
 ]'::jsonb,
 'Vid trafikolycka med personskada är du skyldig att stanna, säkra olycksplatsen (t.ex. med varningstriangel), ringa 112, och ge första hjälpen om det är möjligt utan att du riskerar din egen säkerhet.',
 'normal')

ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RPC: get_quiz_categories — categories with question count and student stats
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_quiz_categories(
  p_org_id     uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'category',       q.category,
      'question_count', q.question_count,
      'last_score',     s.last_score,
      'last_total',     s.last_total,
      'last_attempt',   s.last_attempt
    ) ORDER BY q.category
  )
  INTO v_result
  FROM (
    SELECT
      category,
      COUNT(*) AS question_count
    FROM quiz_questions
    WHERE is_active = true
      AND (organization_id = p_org_id OR organization_id IS NULL)
    GROUP BY category
  ) q
  LEFT JOIN LATERAL (
    SELECT
      qs.score        AS last_score,
      qs.question_count AS last_total,
      qs.completed_at AS last_attempt
    FROM quiz_sessions qs
    WHERE qs.student_id      = p_student_id
      AND qs.organization_id = p_org_id
      AND qs.category        = q.category
      AND qs.completed_at IS NOT NULL
    ORDER BY qs.completed_at DESC
    LIMIT 1
  ) s ON true;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION get_quiz_categories(uuid, uuid) TO service_role;
