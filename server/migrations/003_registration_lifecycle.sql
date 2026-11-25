ALTER TABLE registrations ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE registrations ADD COLUMN registered_at timestamptz;
ALTER TABLE registrations ADD COLUMN cancelled_at timestamptz DEFAULT NULL;
UPDATE registrations SET registered_at=created_at;
ALTER TABLE registrations ALTER COLUMN registered_at SET DEFAULT clock_timestamp();
ALTER TABLE registrations ALTER COLUMN registered_at SET NOT NULL;
ALTER TABLE registrations ADD CONSTRAINT registrations_lifecycle_state CHECK (
  (status='ACTIVE' AND cancelled_at IS NULL) OR
  (status='CANCELLED' AND cancelled_at IS NOT NULL)
);
