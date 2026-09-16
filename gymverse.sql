-- gymverse.sql (Main Execution Script)

-- Uncomment the following lines if running outside an already connected DB
-- CREATE DATABASE gymverse;
-- \c gymverse

\i database/01_schema.sql
\i database/02_constraints.sql
\i database/03_indexes.sql
\i database/04_functions.sql
\i database/05_triggers.sql
\i database/06_views.sql

-- Schema migrations must run before the seed, so seeded rows land in the final shape.
\i database/09_add_user_status.sql
\i database/10_integrity.sql
\i database/11_hardening.sql
\i database/12_trainer_assignments.sql
\i database/13_account_security.sql
\i database/14_maintenance_jobs.sql
\i database/15_revoked_tokens.sql
\i database/16_performance.sql
\i database/17_audit_redaction.sql

\i database/07_seed.sql

-- Verify installation
\dt
\dv
\df

-- Sample reporting queries (read-only; not part of the installation itself)
\i database/08_queries.sql
