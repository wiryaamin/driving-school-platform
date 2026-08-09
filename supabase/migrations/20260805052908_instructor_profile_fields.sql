-- ---------------------------------------------------------------------------
-- Instructor profile fields: address, presentation bio, emergency contact,
-- sort order, and visibility flags for the Personal (Instructor) overview
-- page. These fields already existed as inert UI controls on
-- InstructorDetailPage.tsx (Personlig information / Presentation till
-- Teoricentralen / Anhöriga personer sections) with no backing column, so
-- editing them silently did nothing. Mirrors the address column naming
-- already used on public.students (address_line1, postal_code, city).
-- ---------------------------------------------------------------------------

ALTER TABLE public.instructors
  ADD COLUMN address_line1                text,
  ADD COLUMN postal_code                  text,
  ADD COLUMN city                         text,
  ADD COLUMN bio                          text,
  ADD COLUMN emergency_contact_first_name text,
  ADD COLUMN emergency_contact_last_name  text,
  ADD COLUMN emergency_contact_email      text,
  ADD COLUMN emergency_contact_phone      text,
  ADD COLUMN sort_order                   integer NOT NULL DEFAULT 0,
  ADD COLUMN show_in_booking              boolean NOT NULL DEFAULT true,
  ADD COLUMN show_in_ecommerce            boolean NOT NULL DEFAULT false,
  ADD COLUMN show_on_website              boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.instructors.bio IS
  'Short public-facing presentation shown to the Theory Centre (Teoricentralen) / on booking pages.';
COMMENT ON COLUMN public.instructors.show_in_booking IS
  'Whether this instructor appears in the internal booking/scheduling grid.';
COMMENT ON COLUMN public.instructors.show_in_ecommerce IS
  'Whether this instructor is selectable during public e-commerce / student self-booking.';
COMMENT ON COLUMN public.instructors.show_on_website IS
  'Whether this instructor is listed on the public marketing website.';
