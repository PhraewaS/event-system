import {expect, test} from 'vitest';
import type {Pool} from 'pg';
import {migrate} from '../server/src/migrate.js';

test('CP-17 / migration selects transaction-local owner before any ledger or DDL', async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => { calls.push(sql); return {rows: [], rowCount: 0}; },
    release() {},
  };
  const pool = {connect: async () => client} as unknown as Pool;
  // Options are part of the accepted CP contract; cast lets RED assert runtime behavior.
  await (migrate as (p: Pool, o: {ownerRole: string}) => Promise<void>)(pool, {ownerRole: 'gather'});
  expect(calls[0]).toBe('BEGIN');
  expect(calls[1]).toBe('SET LOCAL ROLE "gather"');
  expect(calls.at(-1)).toBe('COMMIT');
});
