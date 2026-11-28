import {describe,it,expect} from 'vitest';
// @ts-expect-error operator-only native JS
import {readCloudForRelease} from '../deploy/read-cloud-for-release.mjs';
import {cloudFixture} from './fixtures/cloud-config-readback.js';

describe('LG-09 complete configuration review binding',()=>{
  it('returns only metadata/hash, never a literal secret or full template',async()=>{
    const f=cloudFixture();const result=await readCloudForRelease(f);
    expect(result.cloudFieldsMatch).toBe(true);
    expect(result.configReviewHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.releaseActivationAllowed).toBe(false);
    expect(JSON.stringify(result)).not.toContain('NEVER_RETURN_THIS_SENTINEL');
    expect(result).not.toHaveProperty('template');
  });
  it.each(['service','job','revision'] as const)('binds otherwise-unassessed environment values in %s',async(kind)=>{
    const a=cloudFixture(),b=cloudFixture();
    const profile=kind==='service'?b.data.service.template:kind==='job'?b.data.job.template.template:b.data.revision;
    profile.containers[0].env.push({name:'NEW_REVIEWED_SETTING',value:'private-different-value'} as any);
    const first=await readCloudForRelease(a),second=await readCloudForRelease(b);
    expect(first.cloudFieldsMatch).toBe(true);expect(second.cloudFieldsMatch).toBe(true);
    expect(first.configReviewHash).not.toBe(second.configReviewHash);
    expect(JSON.stringify(second)).not.toContain('private-different-value');
  });
  it('does not issue a usable review hash when authoritative metadata checks fail',async()=>{
    const f=cloudFixture();f.data.service.template.containers[0].env[1].value='true';
    const result=await readCloudForRelease(f);
    expect(result.cloudFieldsMatch).toBe(false);expect(result).not.toHaveProperty('configReviewHash');
  });
});
