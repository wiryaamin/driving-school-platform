-- Verification for the M-4 fix (20260728000022): calls process_dunning_tick()
-- twice against the same freshly-overdue, never-dunned invoice
-- (7570150c-4e63-435a-a89a-85ecd18d0a5d, due_date 2026-07-01, already past).
-- The first call must create invoice_dunning_state and emit Invoice.Overdue;
-- the second call's INSERT hits ON CONFLICT DO NOTHING (state already
-- exists) and must NOT emit a second Invoice.Overdue event.

SELECT process_dunning_tick(1000);
SELECT process_dunning_tick(1000);
