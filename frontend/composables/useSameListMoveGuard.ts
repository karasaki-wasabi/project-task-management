// Shared by every kanban-cards Sortable list (stage columns, the backlog
// panel, the assignee focus tray) — none of these lists persist an order,
// so a same-list drag shouldn't visually reposition the card mid-drag
// (Impeccable critique minor observation: this guard was previously
// duplicated identically in three files). Bind as `:on-move` on a
// VueDraggable instance.
//
// User-reported bug: comparing `evt.from !== evt.to` used Sortable's
// `evt.from`, which is fixed at drag START (the ORIGINAL source list) for
// the whole gesture, not "wherever the item currently is." That made a
// multi-hop drag (A → B → back to A, changing your mind) look identical to
// "never left A" — both have `evt.from === "A"` — so returning to the
// origin list was wrongly blocked as a same-list move, silently stranding
// the card in B no matter where the mouse was released. Comparing the
// dragged element's actual live DOM parent against the candidate target
// (`evt.to`) instead asks "is the list under the cursor right now the same
// list this card is CURRENTLY sitting in" — true both times the card
// hasn't left its current list, false the moment it has, regardless of
// where the drag originally started.
export function preventSameListMove(evt: { dragged: HTMLElement; to: HTMLElement }) {
  return evt.dragged.parentElement !== evt.to;
}
