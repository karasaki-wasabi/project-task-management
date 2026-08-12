// Stage badge variants and prefixes (task-status-model 4.2, design.md
// StageBadge.vue: 角丸 6px・枠線・接頭辞; 通常／完了／中止／未設定).
import type { DevelopmentStageKind } from "../../composables/useApiClient";

export type StageBadgePrefixMode = "list" | "modal";

export type StageBadgeVariant = "normal" | "completed" | "cancelled" | "unset";

export function stageBadgePrefix(mode: StageBadgePrefixMode): string {
  // Trailing space separates prefix from the stage name in the rendered label.
  return mode === "modal" ? "開発段階: " : "段階: ";
}

export function stageBadgeVariant(kind: DevelopmentStageKind | null | undefined): StageBadgeVariant {
  if (kind == null) return "unset";
  return kind;
}

export function stageBadgeNameLabel(
  kind: DevelopmentStageKind | null | undefined,
  name: string | null | undefined,
): string {
  if (kind == null) return "未設定";
  return name ?? "";
}

/** Static Tailwind class strings so the JIT scanner sees every token. */
export const STAGE_BADGE_VARIANT_CLASSES: Record<StageBadgeVariant, string> = {
  normal: "bg-white border-solid border-[#cbd5e1] text-slate-700",
  completed: "bg-[#dcfce7] border-solid border-[#86efac] text-green-800",
  cancelled: "bg-slate-100 border-solid border-[#cbd5e1] text-slate-500",
  unset: "bg-white border-dashed border-[#cbd5e1] text-slate-700",
};

export const STAGE_BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-[6px] border px-2 py-0.5 text-xs font-medium";
