// Minimal context-menu renderer. Singleton DOM, viewport-clamped, dismissed on
// outside-mousedown / Esc / scroll. Styled to match the .btn palette in
// our-renderer.html (#4a6cf7 accent, white bg).

export interface MenuItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

const MENU_WIDTH = 220;
const ITEM_HEIGHT = 32;
const SEP_HEIGHT  = 9;
const PAD_Y       = 6;
const VIEWPORT_GAP = 8;

let menuEl: HTMLDivElement | null = null;
let dismissAc: AbortController | null = null;
let styleInjected = false;

function injectStyleOnce(): void {
  if (styleInjected) return;
  styleInjected = true;
  const css = `
.ctx-menu {
  position: fixed;
  z-index: 10000;
  width: ${MENU_WIDTH}px;
  background: #ffffff;
  border: 1px solid #c3cad8;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08);
  padding: ${PAD_Y}px 0;
  font-family: sans-serif;
  font-size: 13px;
  color: #1a2942;
  user-select: none;
}
.ctx-menu .ctx-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  padding: 6px 12px;
  font: inherit;
  color: inherit;
  cursor: pointer;
  height: ${ITEM_HEIGHT}px;
  line-height: 20px;
  box-sizing: border-box;
}
.ctx-menu .ctx-item:hover:not(:disabled) { background: #eef2ff; color: #1a1a2e; }
.ctx-menu .ctx-item:disabled { color: #98a2b3; cursor: not-allowed; }
.ctx-menu .ctx-item.ctx-danger { color: #b91c1c; }
.ctx-menu .ctx-item.ctx-danger:hover:not(:disabled) { background: #fee2e2; }
.ctx-menu .ctx-sep {
  border-top: 1px solid #e2e6ee;
  margin: 4px 6px;
  height: 1px;
}
`;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

function ensureMenuEl(): HTMLDivElement {
  if (menuEl) return menuEl;
  injectStyleOnce();
  const div = document.createElement('div');
  div.className = 'ctx-menu';
  div.style.display = 'none';
  document.body.appendChild(div);
  // Suppress right-click on the menu itself so a right-click inside doesn't
  // re-trigger the canvas's contextmenu handler.
  div.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
  menuEl = div;
  return div;
}

function estimatedHeight(items: MenuItem[]): number {
  let h = PAD_Y * 2;
  for (const it of items) h += it.separator ? SEP_HEIGHT : ITEM_HEIGHT;
  return h;
}

export function showContextMenu(clientX: number, clientY: number, items: MenuItem[]): void {
  const el = ensureMenuEl();
  el.innerHTML = '';

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      el.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'ctx-item' + (item.danger ? ' ctx-danger' : '');
    btn.textContent = item.label;
    btn.disabled = !!item.disabled;
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (item.disabled) return;
      hideContextMenu();
      item.onClick?.();
    });
    el.appendChild(btn);
  }

  const h = estimatedHeight(items);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(VIEWPORT_GAP, Math.min(clientX, vw - MENU_WIDTH - VIEWPORT_GAP));
  const top  = Math.max(VIEWPORT_GAP, Math.min(clientY, vh - h - VIEWPORT_GAP));
  el.style.left = `${left}px`;
  el.style.top  = `${top}px`;
  el.style.display = 'block';

  // Dismissal listeners (reset on every show).
  if (dismissAc) dismissAc.abort();
  dismissAc = new AbortController();
  const opts: AddEventListenerOptions = { signal: dismissAc.signal };

  document.addEventListener('mousedown', (ev: MouseEvent) => {
    if (!menuEl) return;
    if (!menuEl.contains(ev.target as Node)) hideContextMenu();
  }, { ...opts, capture: true });

  document.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') hideContextMenu();
  }, opts);

  document.addEventListener('scroll', () => hideContextMenu(), { ...opts, capture: true });

  // A second contextmenu anywhere else dismisses this menu before the wiring
  // re-opens a fresh one for that location.
  document.addEventListener('contextmenu', (ev: MouseEvent) => {
    if (!menuEl) return;
    if (!menuEl.contains(ev.target as Node)) hideContextMenu();
  }, { ...opts, capture: true });
}

export function hideContextMenu(): void {
  if (menuEl) menuEl.style.display = 'none';
  if (dismissAc) { dismissAc.abort(); dismissAc = null; }
}
