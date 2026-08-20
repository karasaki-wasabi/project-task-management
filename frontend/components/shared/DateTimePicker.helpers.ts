
export interface DateTimeParts {
  dateOnly: string;
  hhmm: string;
}

export function combineDateTime(dateOnly: string, hhmm: string): string {
  if (!dateOnly || !hhmm) return "";
  return `${dateOnly}T${hhmm}`;
}

export function splitDateTime(value: string): DateTimeParts {
  if (!value) return { dateOnly: "", hhmm: "" };
  const separatorIndex = value.indexOf("T");
  if (separatorIndex === -1) return { dateOnly: value, hhmm: "" };
  return {
    dateOnly: value.slice(0, separatorIndex),
    hhmm: value.slice(separatorIndex + 1),
  };
}
