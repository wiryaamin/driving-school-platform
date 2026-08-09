-- Swedish driving schools care specifically about whether a vehicle is
-- usable for both manual and automatic instruction — a licence earned in
-- an automatic-only car is restricted to automatic transmission unless the
-- holder also trains/tests in manual, so a "does both" vehicle is a real,
-- distinct fleet category, not just a display nicety. transmission_type
-- already had 'manual'/'automatic'/'semi_automatic' (a different, purely
-- mechanical distinction) but nothing captured "either" — added here.
ALTER TYPE public.transmission_type ADD VALUE IF NOT EXISTS 'both';
