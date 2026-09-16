-- 12_trainer_assignments.sql
-- Trainer rosters become editable from the app, which needs one active row per
-- member/trainer pair. A member may still work with several trainers.

-- Seed data held duplicate active rows for the same pair (a client listed twice on a
-- roster). Keep the earliest, cancel the rest so the unique index below can be built.
WITH ranked AS (
    SELECT assignment_id,
           ROW_NUMBER() OVER (PARTITION BY member_id, trainer_id ORDER BY start_date, assignment_id) AS rn
    FROM trainer_assignments
    WHERE status = 'active'
)
UPDATE trainer_assignments ta
   SET status   = 'cancelled',
       end_date = COALESCE(ta.end_date, GREATEST(ta.start_date, CURRENT_DATE)),
       notes    = CONCAT_WS(' ', ta.notes, '[duplicate active assignment cancelled by migration 12]')
  FROM ranked r
 WHERE ta.assignment_id = r.assignment_id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trainer_assignment
    ON trainer_assignments (member_id, trainer_id)
    WHERE status = 'active';
