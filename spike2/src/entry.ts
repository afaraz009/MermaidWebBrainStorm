import { parseFixture } from './parser';
import { layoutIR } from './layout';
import { renderFull, setGridOverlay, type RenderState } from './renderer';
import { attachDrag } from './drag';
import type { IR } from './types';

async function main() {
  const mount = document.getElementById('mount') as HTMLElement;
  const resetBtn = document.getElementById('reset') as HTMLButtonElement;
  const gridToggle = document.getElementById('grid-toggle') as HTMLInputElement;

  let ir: IR;
  let detachDrag: (() => void) | null = null;
  let currentState: RenderState | null = null;

  const refreshGrid = () => {
    if (currentState) setGridOverlay(currentState, gridToggle.checked);
  };

  const renderAll = () => {
    layoutIR(ir);
    const state = renderFull(ir, mount);
    currentState = state;
    if (detachDrag) detachDrag();
    detachDrag = attachDrag(state, { onChange: refreshGrid });
    refreshGrid();
  };

  try {
    const fixture = new URLSearchParams(location.search).get('fixture') ?? 'fixture.mmd';
    const src = await fetch(`./${fixture}`).then((r) => r.text());
    ir = await parseFixture(src);
    renderAll();

    resetBtn.addEventListener('click', () => {
      for (const n of ir.nodes) {
        n.pinned = false;
        n.x = undefined;
        n.y = undefined;
      }
      for (const e of ir.edges) {
        e.routedPath = undefined;
        e.routedAt = undefined;
      }
      renderAll();
    });

    gridToggle.addEventListener('change', refreshGrid);
  } catch (err) {
    mount.innerHTML = `<pre style="color:#a00;white-space:pre-wrap">${(err as Error).stack ?? String(err)}</pre>`;
    console.error(err);
  }
}

main();
