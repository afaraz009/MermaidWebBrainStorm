import { parseFixture } from './parser';
import { layoutIR } from './layout';
import { renderFull } from './renderer';
import { attachDrag } from './drag';
import type { IR } from './types';

async function main() {
  const mount = document.getElementById('mount') as HTMLElement;
  const resetBtn = document.getElementById('reset') as HTMLButtonElement;

  let ir: IR;
  let detachDrag: (() => void) | null = null;

  const renderAll = () => {
    layoutIR(ir);
    const state = renderFull(ir, mount);
    if (detachDrag) detachDrag();
    detachDrag = attachDrag(state);
  };

  try {
    const src = await fetch('./fixture.mmd').then((r) => r.text());
    ir = await parseFixture(src);
    renderAll();

    resetBtn.addEventListener('click', () => {
      for (const n of ir.nodes) {
        n.pinned = false;
        n.x = undefined;
        n.y = undefined;
      }
      renderAll();
    });
  } catch (err) {
    mount.innerHTML = `<pre style="color:#a00;white-space:pre-wrap">${(err as Error).stack ?? String(err)}</pre>`;
    console.error(err);
  }
}

main();
