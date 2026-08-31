-- ============================================================================
-- One active occupant per org_structure_positions row.
--
-- org_structure_assignments (20260722000004) deliberately allowed a position
-- zero, one, or several active assignments -- "no fixed headcount cap ...
-- since none was requested". Real feedback (2026-08-31), after the staffing
-- screen's per-position assign/unassign dialog shipped: "لكل منصب شخص واحد
-- فقط بل ان الشخص ممكن يكلف بمنصبين" -- a position holds exactly one person
-- at a time, while one person may still hold several positions. The reverse
-- direction (one employee, several positions) is already fine: the existing
-- `org_structure_assignments_uidx` on (position_id, employee_id) only ever
-- blocked the SAME employee twice on the SAME position, never a different
-- employee on the same position, and never one employee across several
-- different positions.
--
-- A new, narrower partial unique index on `position_id` ALONE is the real
-- enforcement -- a DB constraint, not just the UI hiding the assign form
-- once staffed, since `assignEmployee` must not trust a client that raced
-- two tabs/admins to the same position. `org_structure_assignments_uidx`
-- is left in place rather than dropped: every row it would ever reject is
-- already rejected by this narrower index first, so it is now redundant but
-- harmless, and dropping it is not needed to satisfy this change.
--
-- Verified in a rolled-back transaction before applying for real: a second
-- INSERT for a position that already has one active assignment (a
-- DIFFERENT employee, not the already-blocked same-employee case) is
-- rejected with 23505; unassigning (soft-deleting) the existing row first,
-- then inserting the new one, succeeds. Confirmed live against production
-- beforehand that zero positions currently hold more than one active
-- assignment, so this needed no backfill/cleanup step.
-- ============================================================================

BEGIN;

CREATE UNIQUE INDEX org_structure_assignments_one_per_position_uidx
  ON org_structure_assignments (position_id) WHERE deleted_at IS NULL;

COMMENT ON INDEX org_structure_assignments_one_per_position_uidx IS 'A position holds at most one active occupant at a time. An employee may still hold several different positions -- this only constrains position_id, not employee_id.';

COMMIT;
