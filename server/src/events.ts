// One public snapshot definition for reads and transactional capacity updates.
const fields = `e.id, e.organizer_id AS "organizerId", u.name AS "organizerName", e.title,
  e.description, e.location, e.capacity, e.starts_at AS "startsAt", e.registration_deadline AS "registrationDeadline",
  e.created_at AS "createdAt", c.n AS "registeredCount", e.capacity-c.n AS "remainingPlaces",
  (clock_timestamp()<e.registration_deadline AND c.n<e.capacity) AS "registrationOpen"`;
const from = ` FROM events e JOIN users u ON u.id=e.organizer_id
  CROSS JOIN LATERAL (SELECT count(*)::int AS n FROM registrations WHERE event_id=e.id AND status='ACTIVE') c`;
export const eventSelect = `SELECT ${fields}${from}`;
export const ownedEventSelect = `SELECT ${fields},
  (clock_timestamp()<e.registration_deadline) AS "capacityChangeOpen"${from}`;
