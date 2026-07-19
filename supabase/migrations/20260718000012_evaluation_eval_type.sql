-- ============================================================================
-- Resolves the `eval_type` gap flagged since migration 15
-- (20260718000001): SRU_System_Design.md sketches
-- `evaluations.eval_type ENUM('self','supervisor','peer','customer')`,
-- which was not implemented at the time because that doc section hadn't
-- been found yet.
--
-- Business decision confirmed explicitly with the project owner (asked
-- directly, since this materially changes an already-shipped constraint):
-- `eval_type` allows MULTIPLE evaluation rows per employee per cycle, one
-- per perspective (self/supervisor/peer/customer) — NOT a single-row
-- classification. This means the existing
-- `evaluations_employee_cycle_active_uidx` (employee_id, cycle_id) is now
-- too strict — it must become (employee_id, cycle_id, eval_type).
--
-- [استنتاج] `eval_type` is NOT NULL with no default -- every future
-- INSERT must specify it explicitly (via the create-evaluation Server
-- Action), rather than silently defaulting to one perspective, since the
-- entire point of this column is to make the distinction meaningful.
--
-- [استنتاج, غير مؤكد] The §4-A lifecycle state machine
-- (draft→submitted→...→finalized) is applied UNIFORMLY to every
-- `eval_type` row here -- CLAUDE.md §4-A documents one single lifecycle
-- table, not a different one per eval_type, so this migration does not
-- invent a separate (likely simpler) workflow for `peer`/`customer`
-- evaluations. If SRU's real process needs a lighter-weight lifecycle for
-- those, that is a separate, explicit follow-up decision, not assumed
-- here.
-- ============================================================================

BEGIN;

CREATE TYPE evaluation_eval_type AS ENUM ('self', 'supervisor', 'peer', 'customer');

-- No DEFAULT needed: `evaluations` has zero rows in production as of this
-- migration (confirmed directly beforehand), so a plain NOT NULL add is
-- safe and simpler than the add-with-default-then-drop dance.
ALTER TABLE evaluations ADD COLUMN eval_type evaluation_eval_type NOT NULL;

DROP INDEX evaluations_employee_cycle_active_uidx;

CREATE UNIQUE INDEX evaluations_employee_cycle_type_active_uidx
  ON evaluations (employee_id, cycle_id, eval_type) WHERE deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- Verification queries — run AFTER applying and BEFORE trusting, per
-- PROJECT_STRICT.md rule 10.
-- ============================================================================

-- Expect: 0 rows (table was empty in production at the time of this
-- migration, confirmed before applying — the DEFAULT 'supervisor' used
-- transiently above to satisfy the NOT NULL add-column step never
-- actually applies to any real row).
-- SELECT count(*) FROM evaluations;

-- Expect: two rows for the SAME (employee_id, cycle_id) but DIFFERENT
-- eval_type both succeed; a third with a DUPLICATE (employee_id,
-- cycle_id, eval_type) triple fails with a unique_violation.
