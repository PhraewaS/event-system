import {test,expect} from 'vitest';
import {capacityInput} from '../server/src/validation.js';
import {capacityChangeRejection} from '../server/src/capacity.js';
test('S2-B-UNIT-01 / strict integer bounds and payload shape',()=>{
 for(const capacity of [1,1000000])expect(capacityInput.parse({capacity})).toEqual({capacity});
 for(const value of [{},{capacity:0},{capacity:1000001},{capacity:1.5},{capacity:'2'},{capacity:null},{capacity:1,owner:'other'},null,[]])
  expect(capacityInput.safeParse(value).success).toBe(false);
});
test('S2-B-UNIT-02 / exact cutoff and deadline precedence over active lower bound',()=>{
 const deadline=new Date('2027-01-01T00:00:00Z');
 expect(capacityChangeRejection(new Date(+deadline-1),deadline,2,2)).toBeNull();
 expect(capacityChangeRejection(new Date(+deadline-1),deadline,1,2)).toBe('CAPACITY_BELOW_ACTIVE_COUNT');
 for(const now of [deadline,new Date(+deadline+1)])expect(capacityChangeRejection(now,deadline,1,2)).toBe('CAPACITY_CHANGE_CLOSED');
});
