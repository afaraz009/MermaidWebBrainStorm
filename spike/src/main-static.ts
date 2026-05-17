import { parseToIR } from './parser-adapter.js';
import { layout } from './layout.js';
import { renderFull } from './renderer.js';

async function main() {
  const source = await fetch('./fixture.mmd').then(r => r.text());
  const ir = await parseToIR(source);
  layout(ir);
  const mountEl = document.getElementById('mount') as unknown as SVGElement;
  renderFull(ir, mountEl);
}

main().catch(err => {
  console.error('Render failed:', err);
  document.body.innerHTML = `<pre style="color:red">${err}\n\n${err.stack}</pre>`;
});
