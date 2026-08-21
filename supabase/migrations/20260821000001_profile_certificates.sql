-- profiles.certificates (2026-08-21)
--
-- The My Profile screen has shown "قريبًا" for الشهادات since the field was
-- first sketched (2026-07-22), because no column existed to read. This adds it.
--
-- Plain TEXT, one certificate per line — the same shape
-- `strategic_initiatives.outcomes_ar` already uses for "a short list with no
-- confirmed vocabulary", and the same plain-TEXT choice the other nine
-- demographic columns took in 20260724000002.
--
-- [استنتاج] A child table (name / issuer / issued_on / expires_on) would hold
-- more, but nothing in the request or the source documents says a certificate
-- needs those parts, and inventing them would fix a shape nobody confirmed.
-- Moving to a child table later is a migration, not a rewrite: this column's
-- lines become its rows.
ALTER TABLE profiles ADD COLUMN certificates TEXT;

COMMENT ON COLUMN profiles.certificates IS
  'Certificates held, one per line. NULL = none recorded.';
