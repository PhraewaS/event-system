import type {Pool} from 'pg';
import {AppError} from './errors.js';
import {eventSelect} from './events.js';

export function capacityChangeRejection(now:Date,deadline:Date,capacity:number,activeCount:number){
  if(now>=deadline)return 'CAPACITY_CHANGE_CLOSED';
  if(capacity<activeCount)return 'CAPACITY_BELOW_ACTIVE_COUNT';
  return null;
}
export async function changeEventCapacity(pool:Pool,id:string,organizerId:string,capacity:number){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    // Event only: never acquire a participant lock after this lock.
    const owned=await client.query('SELECT id, capacity, registration_deadline FROM events WHERE id=$1 AND organizer_id=$2 FOR UPDATE',[id,organizerId]);
    if(!owned.rowCount)throw new AppError(404,'NOT_FOUND','Event not found.');
    const stats=(await client.query(`SELECT clock_timestamp() AS now,
      (SELECT count(*)::int FROM registrations WHERE event_id=$1 AND status='ACTIVE') AS active`,[id])).rows[0];
    const rejection=capacityChangeRejection(stats.now,owned.rows[0].registration_deadline,capacity,stats.active);
    if(rejection)throw new AppError(409,rejection,rejection==='CAPACITY_CHANGE_CLOSED'
      ?'Capacity changes for this event have closed.'
      :'Capacity cannot be lower than the number of active registrations.');
    await client.query('UPDATE events SET capacity=$1 WHERE id=$2',[capacity,id]);
    // Count/snapshot computed under the same event lock as every allocation writer.
    const result=await client.query(`${eventSelect} WHERE e.id=$1`,[id]);
    await client.query('COMMIT');
    return result.rows[0];
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
