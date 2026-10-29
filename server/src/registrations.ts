import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { AppError } from "./errors.js";

export type EventRuleInput = { capacity: number; registrationDeadline: Date };
export function registrationRejection(
  event: EventRuleInput,
  duplicate: boolean,
  count: number,
  now: Date,
): string | null {
  if (duplicate) return "DUPLICATE_REGISTRATION";
  if (now >= event.registrationDeadline) return "REGISTRATION_CLOSED";
  if (count >= event.capacity) return "EVENT_FULL";
  return null;
}
const messages: Record<string, string> = {
  DUPLICATE_REGISTRATION: "You already have a registration for this event.",
  REGISTRATION_CLOSED: "Registration for this event has closed.",
  EVENT_FULL: "This event has no places left.",
};
export async function registerParticipant(
  pool: Pool,
  eventId: string,
  participantId: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock before checking: protects capacity across connections and API instances.
    const result = await client.query(
      "SELECT capacity, registration_deadline FROM events WHERE id=$1 FOR UPDATE",
      [eventId],
    );
    if (!result.rowCount)
      throw new AppError(404, "NOT_FOUND", "Event not found.");
    const stats = await client.query(
      `SELECT clock_timestamp() AS now,
      (SELECT count(*)::int FROM registrations WHERE event_id=$1) AS count,
      EXISTS(SELECT 1 FROM registrations WHERE event_id=$1 AND participant_id=$2) AS duplicate`,
      [eventId, participantId],
    );
    const row = result.rows[0];
    const stat = stats.rows[0];
    const rejection = registrationRejection(
      {
        capacity: row.capacity,
        registrationDeadline: row.registration_deadline,
      },
      stat.duplicate,
      stat.count,
      stat.now,
    );
    if (rejection) throw new AppError(409, rejection, messages[rejection]);
    const inserted = await client.query(
      `INSERT INTO registrations(id,event_id,participant_id) VALUES($1,$2,$3)
      RETURNING id, event_id AS "eventId", participant_id AS "participantId", created_at AS "createdAt"`,
      [randomUUID(), eventId, participantId],
    );
    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
