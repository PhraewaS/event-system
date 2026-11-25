export function lifecycleWritesEnabled(value = process.env.REGISTRATION_LIFECYCLE_WRITES_ENABLED): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("REGISTRATION_LIFECYCLE_WRITES_ENABLED must be true or false.");
}
export function cancellationRejection(now: Date, deadline: Date): string | null {
  return now >= deadline ? "CANCELLATION_CLOSED" : null;
}
