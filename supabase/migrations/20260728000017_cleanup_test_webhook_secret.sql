-- Removes the temporary plaintext nets_webhook_secret set in
-- 20260728000016 for webhook-idempotency hardening testing. Unsetting
-- (rather than leaving the plaintext value) lets the next real checkout
-- creation regenerate a fresh, properly encrypted secret naturally, per
-- student-portal/index.ts's existing "generate once, persist encrypted"
-- logic.

UPDATE public.organizations
SET settings = settings - 'nets_webhook_secret'
WHERE id = 'd4279c49-c619-4c66-8c4b-db5e5c80af99';
