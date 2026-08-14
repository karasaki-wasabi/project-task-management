// user-avatar 2.1 — UserAvatar の描画・a11y（Requirements 2.1, 3.1, 4.1）。
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import UserAvatar from "./UserAvatar.vue";
import { generateUserAvatarPattern } from "./UserAvatar.helpers";

const DUMMY_USER_ID = "user-dummy-1";

describe("UserAvatar (user-avatar 2.1)", () => {
  it("sets role, aria-label, and title when name is provided", () => {
    const wrapper = mount(UserAvatar, {
      props: { userId: DUMMY_USER_ID, name: "山田 太郎" },
    });

    expect(wrapper.attributes("role")).toBe("img");
    expect(wrapper.attributes("aria-label")).toBe("山田 太郎");
    expect(wrapper.attributes("title")).toBe("山田 太郎");
    expect(wrapper.attributes("aria-hidden")).toBeUndefined();
  });

  it("is decorative when name is omitted", () => {
    const wrapper = mount(UserAvatar, {
      props: { userId: DUMMY_USER_ID },
    });

    expect(wrapper.attributes("aria-hidden")).toBe("true");
    expect(wrapper.attributes("aria-label")).toBeUndefined();
    expect(wrapper.attributes("title")).toBeUndefined();
    expect(wrapper.attributes("role")).toBeUndefined();
  });

  it.each([20, 24, 28, 32, 64] as const)(
    "applies %spx width/height and size×0.1875 border-radius",
    (size) => {
      const wrapper = mount(UserAvatar, {
        props: { userId: DUMMY_USER_ID, size },
      });
      const svg = wrapper.get("svg");

      expect(svg.attributes("width")).toBe(String(size));
      expect(svg.attributes("height")).toBe(String(size));
      expect(svg.element.style.borderRadius).toBe(`${size * 0.1875}px`);
    },
  );

  it("defaults size to 24", () => {
    const wrapper = mount(UserAvatar, {
      props: { userId: DUMMY_USER_ID },
    });
    const svg = wrapper.get("svg");

    expect(svg.attributes("width")).toBe("24");
    expect(svg.attributes("height")).toBe("24");
    expect(svg.element.style.borderRadius).toBe("4.5px");
  });

  it("renders the pattern as an SVG background plus painted cells", () => {
    const expected = generateUserAvatarPattern(DUMMY_USER_ID);
    expect(expected.cells.length).toBeGreaterThan(0);
    const pad = 0.35;
    const span = expected.gridSize + 2 * pad;

    const wrapper = mount(UserAvatar, {
      props: { userId: DUMMY_USER_ID },
    });
    const svg = wrapper.get("svg");
    const rects = wrapper.findAll("rect");

    expect(svg.attributes("viewBox")).toBe(`${-pad} ${-pad} ${span} ${span}`);
    expect(svg.attributes("shape-rendering")).toBe("crispEdges");
    expect(rects).toHaveLength(1 + expected.cells.length);
    expect(rects[0]!.attributes("x")).toBe(String(-pad));
    expect(rects[0]!.attributes("y")).toBe(String(-pad));
    expect(rects[0]!.attributes("width")).toBe(String(span));
    expect(rects[0]!.attributes("height")).toBe(String(span));
    expect(rects[0]!.attributes("fill")).toBe(expected.backgroundColor);

    for (const [index, cell] of expected.cells.entries()) {
      const rect = rects[index + 1]!;
      // 非整数スケール時のセル間ヘアライン対策でわずかにオーバーラップする
      expect(rect.attributes("x")).toBe(String(cell.x - 0.02));
      expect(rect.attributes("y")).toBe(String(cell.y - 0.02));
      expect(rect.attributes("width")).toBe("1.04");
      expect(rect.attributes("height")).toBe("1.04");
      expect(rect.attributes("fill")).toBe(
        cell.tone === "main" ? expected.mainColor : expected.altColor,
      );
    }
  });
});
