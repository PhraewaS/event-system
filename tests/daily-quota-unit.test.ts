import { test, expect } from "vitest";
test("L7-Q-UNIT-01 / Q04 exact Thai day independently of UTC date/offset", async () => {
  const { thaiEventDay } = await import("../client/src/event-day.js");
  for(const [instant,day] of [
    ["2027-01-02T16:59:59.999Z","2027-01-02"],
    ["2027-01-02T17:00:00.000Z","2027-01-03"],
    ["2027-01-03T00:00:00.000+07:00","2027-01-03"],
    ["2027-01-03T00:00:00.000Z","2027-01-03"],
  ]) expect(thaiEventDay(instant)).toBe(day);
});
test("L7-Q-UNIT-02 / Q02,Q07,Q09 calendar validation and remaining boundary", async () => {
  const { quotaQuery } = await import("../server/src/validation.js");
  const { quotaSnapshot } = await import("../server/src/quota.js");
  for(const date of ["0001-01-01","2000-02-29","9999-12-31"]) expect(quotaQuery.safeParse({date}).success).toBe(true);
  for(const date of ["0000-01-01","1900-02-29","2027-02-30","2027-2-01","2027-01-01T00:00Z"]) expect(quotaQuery.safeParse({date}).success).toBe(false);
  for(const input of [{}, {date:["2027-01-01"]}, {date:"2027-01-01",x:1}]) expect(quotaQuery.safeParse(input).success).toBe(false);
  for(const count of [0,1,2,3]) expect(quotaSnapshot("2027-01-01",count)).toEqual({date:"2027-01-01",timeZone:"Asia/Bangkok",limit:2,registeredCount:count,remaining:Math.max(0,2-count),canRegister:count<2});
});
