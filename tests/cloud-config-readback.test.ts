import {expect,test} from 'vitest';
// @ts-expect-error operator-only native JS
import {collectCloudConfiguration} from '../deploy/read-cloud-configuration.mjs';
import {cloudFixture} from './fixtures/cloud-config-readback.js';

test('RB-01 / matching API observations verify only cloud fields, never authorize activation',async()=>{
  const f=cloudFixture();const result=await collectCloudConfiguration(f);
  expect(result.cloudFieldsMatch).toBe(true);
  expect(result.releaseActivationAllowed).toBe(false);
  expect(f.calls).toContain('service');expect(f.calls).toContain('revision');expect(f.calls).toContain('job');
  expect(JSON.stringify(result)).not.toContain('NEVER_RETURN_THIS_SENTINEL');
});
