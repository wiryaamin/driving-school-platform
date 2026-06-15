-- =============================================================================
-- MIGRATION: 20260619000006_data_migration_expand_entities.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Description:
--   Expands the entity_type CHECK constraint on data_migration_sessions
--   to include 'vehicles' and 'packages' as importable entity types.
-- =============================================================================

ALTER TABLE public.data_migration_sessions
  DROP CONSTRAINT IF EXISTS data_migration_sessions_entity_type_check;

ALTER TABLE public.data_migration_sessions
  ADD CONSTRAINT data_migration_sessions_entity_type_check
  CHECK (entity_type IN (
    'students',
    'instructors',
    'vehicles',
    'packages',
    'bookings',
    'invoices',
    'payments'
  ));
