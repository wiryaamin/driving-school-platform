-- Additive extension to package_offerings: package_code, visibility, featured, internal_notes.
-- All new columns carry safe defaults — zero impact on existing rows.

ALTER TABLE package_offerings
  ADD COLUMN IF NOT EXISTS package_code   TEXT,
  ADD COLUMN IF NOT EXISTS visibility     TEXT NOT NULL DEFAULT 'internal'
                           CONSTRAINT chk_offering_visibility
                           CHECK (visibility IN ('public', 'website', 'student_portal', 'internal')),
  ADD COLUMN IF NOT EXISTS featured       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Unique SKU per org (case-insensitive, NULLs excluded from uniqueness)
CREATE UNIQUE INDEX IF NOT EXISTS uq_package_offering_code
  ON package_offerings (organization_id, lower(package_code))
  WHERE package_code IS NOT NULL;

-- Fast filter for active packages by visibility channel (public listing queries)
CREATE INDEX IF NOT EXISTS idx_package_offerings_visibility
  ON package_offerings (organization_id, visibility)
  WHERE status = 'active';

-- Fast sort for featured/highlighted packages
CREATE INDEX IF NOT EXISTS idx_package_offerings_featured
  ON package_offerings (organization_id, sort_order)
  WHERE featured = true AND status = 'active';
