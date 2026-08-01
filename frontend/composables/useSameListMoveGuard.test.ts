import { describe, expect, it } from "vitest";
import { preventSameListMove } from "./useSameListMoveGuard";

// Pure function, no real DOM needed — plain mutable objects with a
// `parentElement` property stand in for HTMLElements, matching what
// preventSameListMove actually reads (this repo has no DOM/jsdom test
// environment, see frontend/vitest.config.ts, so real elements aren't
// available here anyway). Kept as a separate mutable type from HTMLElement
// itself since `parentElement` is read-only on the real DOM interface.
interface FakeElement {
  parentElement: FakeElement | null;
}

function fakeElement(parent: FakeElement | null = null): FakeElement {
  return { parentElement: parent };
}

function asHTMLElement(el: FakeElement): HTMLElement {
  return el as unknown as HTMLElement;
}

describe("preventSameListMove (drag-path regression: A→B→back-to-A must not be blocked)", () => {
  it("blocks a move when the candidate list is the card's current live parent", () => {
    const listA = fakeElement();
    const dragged = fakeElement(listA);
    expect(preventSameListMove({ dragged: asHTMLElement(dragged), to: asHTMLElement(listA) })).toBe(false);
  });

  it("allows a move when the candidate list differs from the card's current live parent", () => {
    const listA = fakeElement();
    const listB = fakeElement();
    const dragged = fakeElement(listA);
    expect(preventSameListMove({ dragged: asHTMLElement(dragged), to: asHTMLElement(listB) })).toBe(true);
  });

  it("allows returning to the ORIGINAL list once the card has genuinely moved elsewhere first (the reported bug)", () => {
    const listA = fakeElement();
    const listB = fakeElement();
    const dragged = fakeElement(listA);

    // Card genuinely leaves A for B — dragged's live parent is now B.
    expect(preventSameListMove({ dragged: asHTMLElement(dragged), to: asHTMLElement(listB) })).toBe(true);
    dragged.parentElement = listB;

    // Changed their mind: hovering back over A. Must be allowed — this is
    // "currently in B, considering A", not "never left A". The old
    // evt.from-based check (fixed at drag start = A) would have wrongly
    // matched evt.to (A) here and blocked this exact move.
    expect(preventSameListMove({ dragged: asHTMLElement(dragged), to: asHTMLElement(listA) })).toBe(true);
  });
});
