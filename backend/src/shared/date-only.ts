// "YYYY-MM-DD" <-> UTC-midnight Date, so date arithmetic never drifts a day
// due to local-timezone parsing.
export function parseDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
