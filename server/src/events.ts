// One public snapshot definition for reads and transactional capacity updates.
export const eventSelect = `SELECT e.id, e.organizer_id AS "organizerId", u.name AS "organizerName", e.title,
  e.description, e.location, e.capacity, e.starts_at AS "startsAt", e.registration_deadline AS "registrationDeadline",
  e.created_at AS "createdAt", c.n AS "registeredCount", e.capacity-c.n AS "remainingPlaces",
  (clock_timestamp()<e.registration_deadline AND c.n<e.capacity) AS "registrationOpen",
  (clock_timestamp()<e.registration_deadline) AS "capacityChangeOpen"
  FROM events e JOIN users u ON u.id=e.organizer_id
  CROSS JOIN LATERAL (SELECT count(*)::int AS n FROM registrations WHERE event_id=e.id AND status='ACTIVE') c`;
