import { describe, expect, it } from "vitest";
import {
  STAGE_BADGE_BASE_CLASSES,
  STAGE_BADGE_VARIANT_CLASSES,
  stageBadgeNameLabel,
  stageBadgePrefix,
  stageBadgeVariant,
} from "./StageBadge.helpers";

describe("StageBadge.helpers", () => {
  it("list と modal の接頭辞が異なり、段階軸のラベルを共有する", () => {
    expect(stageBadgePrefix("list")).toBe("段階: ");
    expect(stageBadgePrefix("modal")).toBe("開発段階: ");
  });

  it("kind を4つの視覚的バリアントにマッピングし、未設定を含む", () => {
    expect(stageBadgeVariant("normal")).toBe("normal");
    expect(stageBadgeVariant("completed")).toBe("completed");
    expect(stageBadgeVariant("cancelled")).toBe("cancelled");
    expect(stageBadgeVariant(null)).toBe("unset");
    expect(stageBadgeVariant(undefined)).toBe("unset");
  });

  it("未設定を「未設定」とラベルし、それ以外は段階名を使用する", () => {
    expect(stageBadgeNameLabel(null, null)).toBe("未設定");
    expect(stageBadgeNameLabel(undefined, "ignored")).toBe("未設定");
    expect(stageBadgeNameLabel("normal", "未着手")).toBe("未着手");
    expect(stageBadgeNameLabel("completed", "完了")).toBe("完了");
  });

  it("StatusBadge のチップとは異なるbordered rounded-[6px] のシェルを保持する", () => {
    expect(STAGE_BADGE_BASE_CLASSES).toContain("rounded-[6px]");
    expect(STAGE_BADGE_BASE_CLASSES).toContain("border");
    expect(STAGE_BADGE_BASE_CLASSES).not.toContain("rounded-full");
  });

  it("視覚的デザインの4つのバリアントパレットを適用する", () => {
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
