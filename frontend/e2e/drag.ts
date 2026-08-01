// Shared E2E drag helper for the kanban board (user feedback round 2: drag
// interaction moved from the HTML5 Drag and Drop API to vue-draggable-plus
// / Sortable.js in `forceFallback` mode, which drives real mouse events
// rather than native dragstart/dragover/drop — so Playwright's
// `locator.dragTo()` (which dispatches native drag events) no longer
// exercises the real interaction; a manual mouse down/move/up sequence
// does, and doubles as a check that Sortable actually initialized (see
// commit history: a bug where a multi-class `chosenClass` string broke
// Sortable's internal `classList.add()` silently prevented any drag from
// starting, only caught by testing with real mouse events like this).
//
// Not a `.spec.ts` file, so Playwright won't try to run it as a test suite.
import type { Locator, Page } from "@playwright/test";

export async function dragCardTo(page: Page, card: Locator, target: Locator): Promise<void> {
  // The board (`.board`) is its OWN horizontally-scrolling container
  // (`overflow-x-auto`) inside a fixed-width page shell (`app.vue`'s
  // `max-w-6xl`), not the page/viewport itself — so a wide browser
  // viewport alone does not guarantee a far-apart source and target are
  // simultaneously visible; `.board`'s own scroll position matters. Scroll
  // to the source, pick it up, THEN scroll to the target (source and
  // target don't need to be visible at the same time — Sortable tracks
  // the drag by element/pointer state, not by the source staying visible)
  // and complete the drop at the target's post-scroll position.
  await card.scrollIntoViewIfNeeded();
  // Let any scroll (including nested scrollable ancestors, e.g. the
  // backlog panel's own internal list) settle before reading geometry.
  await page.waitForTimeout(150);
  const cardBox = await card.boundingBox();
  if (!cardBox) {
    throw new Error("dragCardTo: source locator has no bounding box (not visible/attached)");
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  // Let Sortable register the "chosen" state before moving — matches real
  // user timing and avoids the drag being interpreted as a click.
  await page.waitForTimeout(150);

  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error("dragCardTo: target locator has no bounding box (not visible/attached)");
  }

  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}
