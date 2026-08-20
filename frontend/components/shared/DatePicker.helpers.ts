export interface DateCell {
  date: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  dayOfWeek: number; // 0 (Sun) .. 6 (Sat) — for weekend-color styling
}

export const WEEKDAY_KANJI = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function weekdayKanji(dayOfWeek: number): string {
  return WEEKDAY_KANJI[dayOfWeek] ?? "";
}

export function formatSlashDate(dateOnly: string): string {
  return toDateOnlyIso(dateOnly).replaceAll("-", "/");
}

export function toDateOnlyIso(value: string): string {
  return value.slice(0, 10);
}

function formatLocalDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseLocalDateOnly(dateOnly: string): Date {
  const parts = toDateOnlyIso(dateOnly).split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day);
}

export function computeTodayIso(now: Date): string {
  return formatLocalDateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function generateMonthGrid(
  year: number,
  month: number,
  todayIso: string,
  selectedIso: string,
): DateCell[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0);

  const leadingDays = firstOfMonth.getDay();
  const trailingDays = 6 - lastOfMonth.getDay();

  const gridStart = new Date(year, month - 1, 1 - leadingDays);
  const totalCells = leadingDays + lastOfMonth.getDate() + trailingDays;

  const cells: DateCell[] = [];
  for (let offset = 0; offset < totalCells; offset += 1) {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + offset);
    const dateIso = formatLocalDateOnly(cellDate);
    cells.push({
      date: dateIso,
      inCurrentMonth: cellDate.getMonth() === month - 1 && cellDate.getFullYear() === year,
      isToday: dateIso === todayIso,
      isSelected: selectedIso !== "" && dateIso === selectedIso,
      dayOfWeek: cellDate.getDay(),
    });
  }

  return cells;
}

export { formatLocalDateOnly, parseLocalDateOnly };
