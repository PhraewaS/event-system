import type { Pool, PoolClient } from "pg";

export const DAILY_LIMIT = 2;
export function quotaSnapshot(date: string, registeredCount: number) {
  return { date, timeZone: "Asia/Bangkok", limit: DAILY_LIMIT, registeredCount,
    remaining: Math.max(0, DAILY_LIMIT - registeredCount), canRegister: registeredCount < DAILY_LIMIT };
}
export async function readQuota(db: Pool | PoolClient, participantId: string, date: string) {
  const result = await db.query(
    `SELECT count(*)::int AS count FROM registrations r JOIN events e ON e.id=r.event_id
     WHERE r.participant_id=$1 AND r.status='ACTIVE'
       AND (e.starts_at AT TIME ZONE 'Asia/Bangkok')::date=$2::date`,
    [participantId, date],
  );
  return quotaSnapshot(date, result.rows[0].count);
}
