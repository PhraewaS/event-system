import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { AppError } from "./errors.js";
import { readQuota } from "./quota.js";
import { cancellationRejection } from "./lifecycle.js";

const returning = `id, event_id AS "eventId", participant_id AS "participantId",
  created_at AS "createdAt", status, registered_at AS "registeredAt", cancelled_at AS "cancelledAt"`;
const disabled = () => new AppError(503, "REGISTRATION_CHANGES_DISABLED", "Registration changes are temporarily unavailable. Please try again later.");

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
  lifecycleEnabled = false,
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
      (SELECT count(*)::int FROM registrations WHERE event_id=$1 AND status='ACTIVE') AS count,
      EXISTS(SELECT 1 FROM registrations WHERE event_id=$1 AND participant_id=$2 AND status='ACTIVE') AS duplicate`,
      [eventId, participantId],
    );
    const row = result.rows[0];
    const stat = stats.rows[0];
    const existing = await client.query("SELECT id,status FROM registrations WHERE event_id=$1 AND participant_id=$2",[eventId,participantId]);
    const reactivating = existing.rows[0]?.status === "CANCELLED";
    if (reactivating && !lifecycleEnabled) throw disabled();
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
    const inserted = reactivating ? await client.query(
      `UPDATE registrations SET status='ACTIVE', registered_at=clock_timestamp(), cancelled_at=NULL WHERE id=$1 RETURNING ${returning}`,
      [existing.rows[0].id],
    ) : await client.query(
      `INSERT INTO registrations(id,event_id,participant_id) VALUES($1,$2,$3)
      RETURNING ${returning}`,
      [randomUUID(), eventId, participantId],
    );
    await client.query("COMMIT");
    return { registration: inserted.rows[0], created: !reactivating };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelRegistration(pool: Pool, id: string, participantId: string, lifecycleEnabled: boolean) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query("SELECT event_id FROM registrations WHERE id=$1 AND participant_id=$2",[id,participantId]);
    if (!target.rowCount) throw new AppError(404,"NOT_FOUND","Registration not found.");
    const owner = await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[participantId]);
    if (!owner.rowCount) throw new AppError(401,"UNAUTHENTICATED","Sign in to continue.");
    const event = await client.query("SELECT registration_deadline FROM events WHERE id=$1 FOR UPDATE",[target.rows[0].event_id]);
    if (!event.rowCount) throw new AppError(404,"NOT_FOUND","Event not found.");
    const current = await client.query(`SELECT ${returning} FROM registrations WHERE id=$1 AND participant_id=$2`,[id,participantId]);
    if (!current.rowCount) throw new AppError(404,"NOT_FOUND","Registration not found.");
    if (current.rows[0].status === "CANCELLED") {
      await client.query("COMMIT");
      return current.rows[0];
    }
    if (!lifecycleEnabled) throw disabled();
    const clock = await client.query("SELECT clock_timestamp() AS now");
    if (cancellationRejection(clock.rows[0].now,event.rows[0].registration_deadline))
      throw new AppError(409,"CANCELLATION_CLOSED","Cancellation for this event has closed.");
    const result = await client.query(`UPDATE registrations SET status='CANCELLED',cancelled_at=clock_timestamp() WHERE id=$1 RETURNING ${returning}`,[id]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch(error) {
    await client.query("ROLLBACK");throw error;
  } finally { client.release(); }
}
