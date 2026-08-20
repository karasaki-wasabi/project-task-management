export interface ExternalHolidayRecord {
  date: string;
  label: string;
}

const HOLIDAYS_JP_API_URL = "https://holidays-jp.github.io/api/v1/date.json";

export async function fetchJapaneseHolidays(): Promise<ExternalHolidayRecord[]> {
  const response = await fetch(HOLIDAYS_JP_API_URL);
  if (!response.ok) {
    throw new Error(`Holidays JP API responded with status ${response.status}`);
  }
  const body = (await response.json()) as Record<string, string>;
  return Object.entries(body).map(([date, label]) => ({ date, label }));
}
