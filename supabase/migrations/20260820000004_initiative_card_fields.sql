-- ============================================================================
-- حقول بطاقة المبادرة (initiative card fields)
--
-- Taken from the two real initiative-card decks supplied 2026-08-20
-- ("مبادرات الاتصال وتقنية المعلومات"، "مبادرات مركز القيم والسلوكيات
-- المهنية"), whose every card carries the same fixed header block:
--
--   الكود            L.5.I.1 / C.2.I.1
--   المخرج           "نظام ال ERP مفعل" / "برنامج تطوير المهارات مفعل"
--   التعريف          (already covered by description_ar)
--   الهدف الرئيسي     (derived from the sub-goal, not stored again)
--   الهدف الفرعي      (sub_goal_id, added 20260820000003)
--   الأفق            H1 / H2
--   الموازنة          x
--   صاحب المبادرة     (owner_org_unit_id, added 20260820000003)
--   تاريخ الابتداء / تاريخ الانتهاء   (start_date / end_date)
--
-- So only four fields were still missing. All are nullable: the real cards
-- themselves leave several blank ("TBD" for both dates on most of them).
--
-- [استنتاج] `budget_note` is TEXT, not NUMERIC: the cards put a bare "x" in
-- that cell rather than an amount, so a numeric column would reject the very
-- data these cards contain. It accepts an amount just as well.
-- [استنتاج] `horizon` is free TEXT rather than an enum: only H1/H2 appear in
-- the two decks provided, which is not enough to fix a vocabulary — same
-- precedent as every other status/label column in this schema.
-- ============================================================================

ALTER TABLE strategic_initiatives
  ADD COLUMN code TEXT,
  ADD COLUMN deliverable_ar TEXT,
  ADD COLUMN horizon TEXT,
  ADD COLUMN budget_note TEXT;

COMMENT ON COLUMN strategic_initiatives.code IS 'كود المبادرة كما في البطاقة، مثل L.5.I.1';
COMMENT ON COLUMN strategic_initiatives.deliverable_ar IS 'المخرج المتوقع من المبادرة، مثل «نظام ال ERP مفعل»';
COMMENT ON COLUMN strategic_initiatives.horizon IS 'الأفق الزمني كما في البطاقة، مثل H1';
COMMENT ON COLUMN strategic_initiatives.budget_note IS 'الموازنة كما في البطاقة — نصّ لأن البطاقات الحقيقية تضع علامة x لا مبلغًا.';

-- Codes are optional, but must not repeat among live rows when present.
CREATE UNIQUE INDEX strategic_initiatives_code_uidx
  ON strategic_initiatives (code)
  WHERE code IS NOT NULL AND deleted_at IS NULL;
