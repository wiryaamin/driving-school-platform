-- ════════════════════════════════════════════════════════════════════════════
-- Communication Engine — Hardening
--
-- 1. Add retry_after column for exponential backoff tracking.
-- 2. Add index for future auto-retry worker.
-- 3. Seed default Swedish notification templates (platform-wide, org IS NULL).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. retry_after column ─────────────────────────────────────────────────────
-- Populated by the retry endpoint when a dispatch fails again.
-- Formula: now() + 2^retry_count minutes (1, 2, 4, 8 … minutes).
-- A future retry worker can query: retry_after <= now() AND status = 'failed'.

ALTER TABLE outbound_messages
  ADD COLUMN IF NOT EXISTS retry_after timestamptz;

-- ── 2. Retry worker index ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_outbound_messages_retry
  ON outbound_messages(retry_after)
  WHERE status = 'failed'
    AND retry_count < max_retries
    AND deleted_at IS NULL;

-- ── 3. Default Swedish notification templates ─────────────────────────────────
-- organization_id IS NULL = platform-wide defaults visible to all orgs.
-- Org-specific rows (same key+locale+channel, non-null org_id) override these.
-- Idempotent: inserts only rows that do not already exist.

INSERT INTO notification_templates (key, locale, channel, subject, body_text, variables, is_active)
SELECT t.key, t.locale, t.channel, t.subject, t.body_text, t.variables, true
FROM (VALUES
  (
    'booking.confirmed', 'sv', 'sms',
    NULL::text,
    'Hej {förnamn}! Din körlektion {datum} kl {tid} är bekräftad. Välkommen! / {trafikskola}',
    ARRAY['förnamn','datum','tid','trafikskola']::text[]
  ),
  (
    'booking.reminder_1d', 'sv', 'sms',
    NULL::text,
    'Påminnelse: Du har körlektion imorgon {datum} kl {tid}. / {trafikskola}',
    ARRAY['datum','tid','trafikskola']::text[]
  ),
  (
    'booking.reminder_2h', 'sv', 'sms',
    NULL::text,
    'Påminnelse: Din körlektion börjar om 2 timmar kl {tid}. Ses snart! / {trafikskola}',
    ARRAY['tid','trafikskola']::text[]
  ),
  (
    'booking.cancelled', 'sv', 'sms',
    NULL::text,
    'Din körlektion {datum} kl {tid} är avbokad. Kontakta oss för att boka om. / {trafikskola}',
    ARRAY['datum','tid','trafikskola']::text[]
  ),
  (
    'booking.waitlist_available', 'sv', 'sms',
    NULL::text,
    'Hej {förnamn}! En ledig tid har öppnats {datum} kl {tid}. Boka nu! / {trafikskola}',
    ARRAY['förnamn','datum','tid','trafikskola']::text[]
  ),
  (
    'booking.confirmed', 'sv', 'email',
    'Bokningsbekräftelse – {datum} kl {tid}'::text,
    E'Hej {förnamn},\n\nDin körlektion är bekräftad:\nDatum: {datum}\nTid: {tid}\n\nVälkommen!\n\nMed vänliga hälsningar\n{trafikskola}',
    ARRAY['förnamn','datum','tid','trafikskola']::text[]
  ),
  (
    'invoice.payment_reminder', 'sv', 'email',
    'Påminnelse om betalning – faktura {fakturanr}'::text,
    E'Hej {förnamn},\n\nVi vill påminna om din faktura {fakturanr} på {belopp} kr med förfallodatum {förfallodatum}.\n\nBetala via {betalsätt}.\n\nMed vänliga hälsningar\n{trafikskola}',
    ARRAY['förnamn','fakturanr','belopp','förfallodatum','betalsätt','trafikskola']::text[]
  ),
  (
    'welcome.new_student', 'sv', 'email',
    'Välkommen till {trafikskola}!'::text,
    E'Hej {förnamn},\n\nVälkommen till {trafikskola}!\n\nDitt konto är nu aktiverat. Logga in på {loginlänk} för att se dina bokningar och kursmaterial.\n\nVid frågor är du välkommen att höra av dig.\n\nMed vänliga hälsningar\n{trafikskola}',
    ARRAY['förnamn','trafikskola','loginlänk']::text[]
  ),
  (
    'welcome.new_student', 'sv', 'sms',
    NULL::text,
    'Välkommen till {trafikskola}, {förnamn}! Ditt konto är aktiverat. Logga in: {loginlänk}',
    ARRAY['förnamn','trafikskola','loginlänk']::text[]
  )
) AS t(key, locale, channel, subject, body_text, variables)
WHERE NOT EXISTS (
  SELECT 1
  FROM notification_templates nt
  WHERE nt.key            = t.key
    AND nt.locale         = t.locale
    AND nt.channel        = t.channel
    AND nt.organization_id IS NULL
);
