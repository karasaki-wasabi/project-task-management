export function preventSameListMove(evt: { dragged: HTMLElement; to: HTMLElement }) {
  return evt.dragged.parentElement !== evt.to;
}
