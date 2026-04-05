-- Soft delete: schedule account deletion with a 30-day grace period.
-- If the user logs in within 30 days, deletion_requested_at is cleared (cancelled).
-- After 30 days, a cleanup job will hard-delete the account and clear PII.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
