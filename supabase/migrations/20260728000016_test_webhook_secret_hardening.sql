-- Temporary: sets a known plaintext nets_webhook_secret for the E2E test org
-- so live webhook-idempotency hardening can send a genuinely authorized
-- request. decryptCredential() already has a documented backward-compat
-- path for unencrypted values (no "enc:v1:" prefix returned as-is), so this
-- is a real, supported code path, not a bypass. Reverted by a follow-up
-- migration once the test completes.

UPDATE public.organizations
SET settings = settings || jsonb_build_object('nets_webhook_secret', 'hardening-test-secret-do-not-use-in-prod')
WHERE id = 'd4279c49-c619-4c66-8c4b-db5e5c80af99';
