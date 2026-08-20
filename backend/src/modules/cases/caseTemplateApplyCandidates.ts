export type CaseTemplateApplyOperation =
  | "start_generate"
  | "start_regenerate"
  | "start_delete"
  | "end_generate"
  | "end_regenerate"
  | "end_delete"
  | "month_generate"
  | "month_regenerate"
  | "month_delete";

export type CaseDateInput = string | Date | null | undefined;

function toDayKey(value: CaseDateInput): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 10);
}

export function buildCaseTemplateApplyCandidates(
  oldStart: CaseDateInput,
  oldEnd: CaseDateInput,
  newStart: CaseDateInput,
  newEnd: CaseDateInput,
): CaseTemplateApplyOperation[] {
  const prevStart = toDayKey(oldStart);
  const prevEnd = toDayKey(oldEnd);
  const nextStart = toDayKey(newStart);
  const nextEnd = toDayKey(newEnd);

  const ops: CaseTemplateApplyOperation[] = [];

  if (prevStart === null && nextStart !== null) {
    ops.push("start_generate");
  } else if (prevStart !== null && nextStart === null) {
    ops.push("start_delete");
  } else if (prevStart !== null && nextStart !== null && prevStart !== nextStart) {
    ops.push("start_regenerate");
  }

  if (prevEnd === null && nextEnd !== null) {
    ops.push("end_generate");
  } else if (prevEnd !== null && nextEnd === null) {
    ops.push("end_delete");
  } else if (prevEnd !== null && nextEnd !== null && prevEnd !== nextEnd) {
    ops.push("end_regenerate");
  }

  const hadBoth = prevStart !== null && prevEnd !== null;
  const hasBoth = nextStart !== null && nextEnd !== null;

  if (!hadBoth && hasBoth) {
    ops.push("month_generate");
  } else if (hadBoth && hasBoth) {
    const startChanged = prevStart !== nextStart;
    const endChanged = prevEnd !== nextEnd;
    if (startChanged || endChanged) {
      ops.push("month_regenerate");
    }
  } else if (hadBoth && !hasBoth) {
    ops.push("month_delete");
  }

  return ops;
}
