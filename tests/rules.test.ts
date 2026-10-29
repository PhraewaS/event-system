import { describe, expect, test } from "vitest";
import { registrationRejection } from "../server/src/registrations.js";

describe("T-07 unit / AC-07 registration rule boundaries", () => {
  const deadline = new Date("2027-01-02T10:00:00Z");
  const event = { capacity: 1, registrationDeadline: deadline };
  test("accepts immediately before the deadline", () => {
    expect(
      registrationRejection(event, false, 0, new Date(deadline.getTime() - 1)),
    ).toBeNull();
  });
  test("rejects exactly at and after the deadline", () => {
    expect(registrationRejection(event, false, 0, deadline)).toBe(
      "REGISTRATION_CLOSED",
    );
    expect(
      registrationRejection(event, false, 0, new Date(deadline.getTime() + 1)),
    ).toBe("REGISTRATION_CLOSED");
  });
  test("duplicate takes precedence when full or closed", () => {
    expect(registrationRejection(event, true, 1, deadline)).toBe(
      "DUPLICATE_REGISTRATION",
    );
  });
  test("capacity boundary rejects only when all places are taken", () => {
    const before = new Date(deadline.getTime() - 1);
    expect(registrationRejection(event, false, 1, before)).toBe("EVENT_FULL");
    expect(
      registrationRejection({ ...event, capacity: 2 }, false, 1, before),
    ).toBeNull();
  });
});
