import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { AppError } from "./errors.js";
import { readQuota } from "./quota.js";

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
    // Global writer order: participant -> event. Serializes one user's requests
    // across different events/API instances, as well as the event's final place.
    const participant = await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [participantId]);
    if (!participant.rowCount) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    const result = await client.query(
      `SELECT capacity, registration_deadline,
       to_char(starts_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS event_day
       FROM events WHERE id=$1 FOR UPDATE`,
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
    const quota = await readQuota(client, participantId, row.event_day);
    if (!quota.canRegister) throw new AppError(409, "DAILY_REGISTRATION_LIMIT",
      "You can register for at most 2 events on the same day (Asia/Bangkok).");
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
