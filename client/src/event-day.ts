const thaiDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok", calendar: "gregory", numberingSystem: "latn",
  year: "numeric", month: "2-digit", day: "2-digit",
});
export function thaiEventDay(instant: string): string {
  const parts = thaiDay.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes, width: number) =>
    parts.find(value => value.type === type)!.value.padStart(width, "0");
  return `${part("year", 4)}-${part("month", 2)}-${part("day", 2)}`;
}
