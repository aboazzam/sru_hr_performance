-- Two new process areas backing the two new /reports tabs requested
-- directly: "الأعمال اليومية" (BAU tasks) and "تقييم 360". Same
-- tab-level-gate-on-top-of-existing-table-RLS pattern as
-- performanceReports/competencyReports (20260727000006) -- these are
-- separate from bauTasks/evaluation (which gate DOING the work), so
-- granting report visibility doesn't also grant write access to either
-- module. Each ALTER TYPE runs in its own transaction (Postgres requires a
-- separate transaction from first use) -- no role_permissions seeded
-- (least-privilege default, same precedent).
ALTER TYPE process_area ADD VALUE 'bauTasksReports';
