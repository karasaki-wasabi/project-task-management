import { describe, expect, it } from "vitest";
import { preventSameListMove } from "./useSameListMoveGuard";

interface FakeElement {
  parentElement: FakeElement | null;
}

function fakeElement(parent: FakeElement | null = null): FakeElement {
  return { parentElement: parent };
}

function asHTMLElement(el: FakeElement): HTMLElement {
  return el as unknown as HTMLElement;
}

describe("preventSameListMove (A→B→back-to-A はブロックしない)", () => {
  it("候補リストがカードの現在のライブ親の場合、移動をブロック", () => {
    const listA = fakeElement();
    const dragged = fakeElement(listA);
    expect(preventSameListMove({ dragged: asHTMLElement(dragged), to: asHTMLElement(listA) })).toBe(false);
  });

  it("候補リストがカードの現在のライブ親と異なる場合、移動を許可", () => {
    const listA = fakeElement();
    const listB = fakeElement();
    const dragged = fakeElement(listA);
    expect(preventSameListMove({ dragged: asHTMLElement(dragged), to: asHTMLElement(listB) })).toBe(true);
  });

  it("カードが他の場所に確実に移動した後、元のリストに戻ることを許可", () => {
    const listA = fakeElement();
    const listB = fakeElement();
    const dragged = fakeElement(listA);

    expect(preventSameListMove({ dragged: asHTMLElement(dragged), to: asHTMLElement(listB) })).toBe(true);
    dragged.parentElement = listB;

    expect(preventSameListMove({ dragged: asHTMLElement(dragged), to: asHTMLElement(listA) })).toBe(true);
  });
});
