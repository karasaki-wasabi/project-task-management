
import { parseLocalDateOnly, type DateCell } from "../../../../components/shared/DatePicker.helpers";
import { isTaskClosed } from "../../../../composables/useTaskClosure";
export interface TaskMarkerView {
  taskId: string;
  title: string;
  stage: string | null;
  isOverdue: boolean;
}

export interface DayVisibleMarkers {
  visible: TaskMarkerView[];
  overflowCount: number;
}

function toLocalDateKey(dateOnly: string): string {
  return dateOnly.slice(0, 10);
}

export function buildTaskMarkersByDate(
  tasks: Task[],
  stages: DevelopmentStage[],
  todayIso: string,
): Map<string, TaskMarkerView[]> {
  const markersByDate = new Map<string, TaskMarkerView[]>();

  for (const task of tasks) {
    if (!task.scheduledEndDate) {
      continue;
    }

    const dateKey = toLocalDateKey(task.scheduledEndDate);

    const stage = task.developmentStageId
      ? (stages.find((s) => s.id === task.developmentStageId)?.name ?? task.developmentStageId)
      : null;

    const isOverdue = dateKey < todayIso && !isTaskClosed(task, stages);

    const marker: TaskMarkerView = { taskId: task.id, title: task.title, stage, isOverdue };

    const existing = markersByDate.get(dateKey);
    if (existing) {
      existing.push(marker);
    } else {
      markersByDate.set(dateKey, [marker]);
    }
  }

  return markersByDate;
}

export function truncateDayMarkers(markers: TaskMarkerView[], maxVisible: number): DayVisibleMarkers {
  if (markers.length <= maxVisible) {
    return { visible: markers, overflowCount: 0 };
  }

  const visibleCount = Math.max(0, maxVisible - 1);
  return {
    visible: markers.slice(0, visibleCount),
    overflowCount: markers.length - visibleCount,
  };
}

export const TASK_OVERFLOW_DISPLAY_CAP = 99;
export const CASE_OVERFLOW_DISPLAY_CAP = 9;

export function formatTaskOverflowLabel(overflowCount: number): string {
  const n = overflowCount > TASK_OVERFLOW_DISPLAY_CAP ? `${TASK_OVERFLOW_DISPLAY_CAP}+` : String(overflowCount);
  return `他${n}件`;
}

export function formatCaseOverflowLabel(overflowCount: number): string {
  const n = overflowCount > CASE_OVERFLOW_DISPLAY_CAP ? `${CASE_OVERFLOW_DISPLAY_CAP}+` : String(overflowCount);
  return `他${n}件`;
}

export function collectWeekCasePopupItems(weekLanes: WeekCaseLanes, cases: Case[]): CaseOverflowItem[] {
  const byId = new Map(cases.map((caseItem) => [caseItem.id, caseItem]));
  const items: CaseOverflowItem[] = [];

  for (const laneItem of weekLanes.lanes.flat()) {
    const caseItem = byId.get(laneItem.caseId);
    const startKey = caseItem?.startDate ? toLocalDateKey(caseItem.startDate) : null;
    const endKey = caseItem?.endDate ? toLocalDateKey(caseItem.endDate) : null;
    items.push({
      caseId: laneItem.caseId,
      name: laneItem.name,
      rangeLabel: formatRangeLabel(startKey, endKey),
    });
  }

  for (const overflowItem of weekLanes.overflow) {
    items.push(overflowItem);
  }

  return items;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroIndexedMonth = month - 1 + delta;
  const yearOffset = Math.floor(zeroIndexedMonth / 12);
  const normalizedMonth = ((zeroIndexedMonth % 12) + 12) % 12;

  return {
    year: year + yearOffset,
    month: normalizedMonth + 1,
  };
}

export function colorIndexForCase(caseId: string): number {
  let hash = 0;
  for (let i = 0; i < caseId.length; i += 1) {
    hash = (hash * 31 + caseId.charCodeAt(i)) | 0;
  }
  return ((hash % 6) + 6) % 6;
}

export interface CaseLaneItem {
  caseId: string;
  name: string;
  isCompleted: boolean;
  colorIndex: number;
  startDayIndex: number;
  endDayIndex: number;
  openStart: boolean;
  openEnd: boolean;
}

export interface CaseOverflowItem {
  caseId: string;
  name: string;
  rangeLabel: string;
}

export interface WeekCaseLanes {
  lanes: CaseLaneItem[][];
  overflow: CaseOverflowItem[];
}

export interface WeekRowBudget {
  bandRows: number;
  maxTasks: number;
}

function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatRangeLabel(startKey: string | null, endKey: string | null): string {
  if (startKey !== null && endKey !== null) {
    return `${formatMonthDay(startKey)} 〜 ${formatMonthDay(endKey)}`;
  }
  if (startKey !== null) {
    return `${formatMonthDay(startKey)} 〜`;
  }
  if (endKey !== null) {
    return `〜 ${formatMonthDay(endKey)}`;
  }
  return "";
}

function diffDays(startKey: string, endKey: string): number {
  const start = parseLocalDateOnly(startKey);
  const end = parseLocalDateOnly(endKey);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

interface CaseLaneCandidate {
  caseId: string;
  name: string;
  isCompleted: boolean;
  startKey: string | null;
  endKey: string | null;
  startDayIndex: number;
  endDayIndex: number;
  openStart: boolean;
  openEnd: boolean;
}

function compareCandidates(a: CaseLaneCandidate, b: CaseLaneCandidate): number {
  const aOpenEnded = a.startKey === null || a.endKey === null;
  const bOpenEnded = b.startKey === null || b.endKey === null;
  if (aOpenEnded !== bOpenEnded) {
    return aOpenEnded ? -1 : 1;
  }

  const aDuration = aOpenEnded ? Number.POSITIVE_INFINITY : diffDays(a.startKey!, a.endKey!);
  const bDuration = bOpenEnded ? Number.POSITIVE_INFINITY : diffDays(b.startKey!, b.endKey!);
  if (aDuration !== bDuration) {
    return bDuration - aDuration;
  }

  const aSortStart = a.startKey ?? a.endKey ?? "";
  const bSortStart = b.startKey ?? b.endKey ?? "";
  if (aSortStart < bSortStart) return -1;
  if (aSortStart > bSortStart) return 1;
  return 0;
}

export function buildWeekCaseLanes(weekDays: DateCell[], cases: Case[], maxLanes: number): WeekCaseLanes {
  const weekStart = weekDays[0]?.date ?? "";
  const weekEnd = weekDays[weekDays.length - 1]?.date ?? "";

  const candidates: CaseLaneCandidate[] = [];

  for (const caseItem of cases) {
    const startKey = caseItem.startDate ? toLocalDateKey(caseItem.startDate) : null;
    const endKey = caseItem.endDate ? toLocalDateKey(caseItem.endDate) : null;

    if (startKey === null && endKey === null) {
      continue;
    }

    const overlapsWeek = (startKey === null || startKey <= weekEnd) && (endKey === null || endKey >= weekStart);
    if (!overlapsWeek) {
      continue;
    }

    const openStart = startKey === null || startKey < weekStart;
    const openEnd = endKey === null || endKey > weekEnd;

    const startDayIndex = openStart ? 0 : weekDays.findIndex((cell) => cell.date === startKey);
    const endDayIndex = openEnd ? weekDays.length - 1 : weekDays.findIndex((cell) => cell.date === endKey);

    candidates.push({
      caseId: caseItem.id,
      name: caseItem.name,
      isCompleted: caseItem.isCompleted,
      startKey,
      endKey,
      startDayIndex,
      endDayIndex,
      openStart,
      openEnd,
    });
  }

  candidates.sort(compareCandidates);

  const firstPass = placeCandidatesIntoLanes(candidates, maxLanes);
  if (firstPass.overflow.length === 0 || maxLanes <= 0) {
    return firstPass;
  }

  return placeCandidatesIntoLanes(candidates, Math.max(0, maxLanes - 1));
}

function placeCandidatesIntoLanes(candidates: CaseLaneCandidate[], laneCap: number): WeekCaseLanes {
  const lanes: CaseLaneItem[][] = [];
  const overflow: CaseOverflowItem[] = [];

  for (const candidate of candidates) {
    const laneItem: CaseLaneItem = {
      caseId: candidate.caseId,
      name: candidate.name,
      isCompleted: candidate.isCompleted,
      colorIndex: colorIndexForCase(candidate.caseId),
      startDayIndex: candidate.startDayIndex,
      endDayIndex: candidate.endDayIndex,
      openStart: candidate.openStart,
      openEnd: candidate.openEnd,
    };

    let placed = false;
    for (const lane of lanes) {
      const overlapsLane = lane.some(
        (existing) => laneItem.startDayIndex <= existing.endDayIndex && laneItem.endDayIndex >= existing.startDayIndex,
      );
      if (!overlapsLane) {
        lane.push(laneItem);
        placed = true;
        break;
      }
    }

    if (placed) {
      continue;
    }

    if (lanes.length < laneCap) {
      lanes.push([laneItem]);
    } else {
      overflow.push({
        caseId: candidate.caseId,
        name: candidate.name,
        rangeLabel: formatRangeLabel(candidate.startKey, candidate.endKey),
      });
    }
  }

  return { lanes, overflow };
}

export function computeWeekRowBudget(
  laneCount: number,
  hasOverflow: boolean,
  totalRows: number,
  maxLanes: number,
): WeekRowBudget {
  const bandRows = Math.min(laneCount + (hasOverflow ? 1 : 0), maxLanes);
  return { bandRows, maxTasks: totalRows - bandRows };
}
