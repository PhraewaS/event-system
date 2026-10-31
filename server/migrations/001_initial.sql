CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('PARTICIPANT', 'ORGANIZER'))
);

CREATE TABLE events (
  id uuid PRIMARY KEY,
  organizer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 120),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 4000),
  location text NOT NULL CHECK (length(trim(location)) BETWEEN 2 AND 200),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 1000000),
  starts_at timestamptz NOT NULL,
  registration_deadline timestamptz NOT NULL CHECK (registration_deadline <= starts_at),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX events_organizer_created ON events(organizer_id, created_at DESC);

CREATE TABLE registrations (
  id uuid PRIMARY KEY,
  participant_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (participant_id, event_id)
);
CREATE INDEX registrations_event ON registrations(event_id);

CREATE TABLE session (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX session_expire ON session(expire);
