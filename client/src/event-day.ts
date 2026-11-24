const thaiDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
});
export function thaiEventDay(instant: string): string {
  return thaiDay.format(new Date(instant));
}
