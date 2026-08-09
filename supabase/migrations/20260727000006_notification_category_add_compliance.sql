-- =============================================================================
-- Fix: notification_category enum missing 'compliance'
--
-- Same enum-drift bug class already found and fixed 3 times this session
-- (payment_method, payment_requests.provider, identity_security_events.provider):
-- event-worker's new checkDueRegulatoryWorkflows() (Regulatory Workflow
-- Tracker reminder check) inserts category: 'compliance' into notifications
-- — caught live during commissioning when the insert failed with
-- "invalid input value for enum notification_category". Widening a native
-- Postgres enum only needs ADD VALUE, not a drop-and-recreate like the
-- earlier three (which were plain CHECK constraints).
-- =============================================================================

ALTER TYPE notification_category ADD VALUE IF NOT EXISTS 'compliance';
