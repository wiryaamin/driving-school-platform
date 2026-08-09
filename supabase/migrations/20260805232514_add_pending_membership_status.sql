-- ---------------------------------------------------------------------------
-- Account Registration / Email Verification / Activation Workflow redesign.
--
-- membership_status previously had no way to represent "invited but has not
-- yet set a password" — every new membership row was inserted as 'active'
-- the instant an invite was created, meaning the invited person's account
-- was fully live (and, per the existing "no active membership → empty
-- claims" fallback in get_user_jwt_claims, had a working — if permission-
-- less — session) before they had ever proven control of the mailbox or
-- chosen a password. 'pending' closes that gap: a membership stays
-- 'pending' until activate_membership() (added in the next migration) flips
-- it to 'active', which only happens after a successful password
-- submission on the invite-acceptance page.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction as any
-- statement that references the new value, so this is deliberately its own
-- migration file with nothing else in it.
-- ---------------------------------------------------------------------------

ALTER TYPE public.membership_status ADD VALUE IF NOT EXISTS 'pending';
