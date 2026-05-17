import { parseToIR } from './parser-adapter.js';
import { layout } from './layout.js';
import { renderFull } from './renderer.js';
import { attachDrag } from './drag.js';
import type { IR } from './types.js';

let ir: IR;
let source: string;
const svg = document.getElementById('mount') as unknown as SVGSVGElement;

async function main() {
  source = await fetch('./fixture.mmd').then(r => r.text());
  ir = await parseToIR(source);
  layout(ir);
  renderFull(ir, svg, true);
  attachDrag(svg, ir, svg);
}

document.getElementById('reset')!.addEventListener('click', async () => {
  ir.nodes.forEach(n => { n.pinned = false; delete n.x; delete n.y; });
  layout(ir);
  renderFull(ir, svg, true);
  attachDrag(svg, ir, svg);
});

main().catch(err => {
  console.error('Render failed:', err);
  document.body.innerHTML = `<pre style="color:red">${err}\n\n${err.stack}</pre>`;
});
