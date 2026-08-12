// task-status-model 4.2 — StageBadge helpers (Requirements 8.2, 8.3).
import { describe, expect, it } from "vitest";
import {
  STAGE_BADGE_BASE_CLASSES,
  STAGE_BADGE_VARIANT_CLASSES,
  stageBadgeNameLabel,
  stageBadgePrefix,
  stageBadgeVariant,
} from "./StageBadge.helpers";

describe("StageBadge.helpers (task-status-model 4.2)", () => {
  it("uses list and modal prefixes that differ while sharing the stage axis label", () => {
    expect(stageBadgePrefix("list")).toBe("段階: ");
    expect(stageBadgePrefix("modal")).toBe("開発段階: ");


  });

  it("maps kind to the four visual variants including unset", () => {
    expect(stageBadgeVariant("normal")).toBe("normal");
    expect(stageBadgeVariant("completed")).toBe("completed");
    expect(stageBadgeVariant("cancelled")).toBe("cancelled");
    expect(stageBadgeVariant(null)).toBe("unset");
    expect(stageBadgeVariant(undefined)).toBe("unset");
  });

  it("labels unset as 未設定 and otherwise uses the stage name", () => {
    expect(stageBadgeNameLabel(null, null)).toBe("未設定");
    expect(stageBadgeNameLabel(undefined, "ignored")).toBe("未設定");
    expect(stageBadgeNameLabel("normal", "未着手")).toBe("未着手");
    expect(stageBadgeNameLabel("completed", "完了")).toBe("完了");
  });

  it("keeps a bordered rounded-[6px] shell distinct from StatusBadge pills", () => {
    expect(STAGE_BADGE_BASE_CLASSES).toContain("rounded-[6px]");
    expect(STAGE_BADGE_BASE_CLASSES).toContain("border");
    expect(STAGE_BADGE_BASE_CLASSES).not.toContain("rounded-full");
  });

  it("applies the four variant palettes from the visual design", () => {
    expect(STAGE_BADGE_VARIANT_CLASSES.normal).toContain("bg-white");
    expect(STAGE_BADGE_VARIANT_CLASSES.normal).toContain("border-[#cbd5e1]");
    expect(STAGE_BADGE_VARIANT_CLASSES.completed).toContain("bg-[#dcfce7]");
    expect(STAGE_BADGE_VARIANT_CLASSES.completed).toContain("border-[#86efac]");
    expect(STAGE_BADGE_VARIANT_CLASSES.cancelled).toContain("bg-slate-100");
    expect(STAGE_BADGE_VARIANT_CLASSES.cancelled).toContain("text-slate-500");
    expect(STAGE_BADGE_VARIANT_CLASSES.unset).toContain("border-dashed");
    expect(STAGE_BADGE_VARIANT_CLASSES.unset).toContain("bg-white");
  });
});
