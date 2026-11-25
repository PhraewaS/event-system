import {test,expect} from "vitest";
import {cancellationRejection,lifecycleWritesEnabled} from "../server/src/lifecycle.js";
test("S2-A-UNIT-01 / exact deadline boundary",()=>{
 const deadline=new Date("2027-01-02T17:00:00.000Z");
 expect(cancellationRejection(new Date(deadline.getTime()-1),deadline)).toBeNull();
 expect(cancellationRejection(deadline,deadline)).toBe("CANCELLATION_CLOSED");
 expect(cancellationRejection(new Date(deadline.getTime()+1),deadline)).toBe("CANCELLATION_CLOSED");
});
test("S2-A-DEPLOY-01 / lifecycle gate defaults false and rejects invalid config",()=>{
 expect(lifecycleWritesEnabled("false")).toBe(false);expect(lifecycleWritesEnabled("true")).toBe(true);
 for(const value of ["1","TRUE","yes",""])expect(()=>lifecycleWritesEnabled(value)).toThrow();
});
