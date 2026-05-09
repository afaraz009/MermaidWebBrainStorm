import { parseFixture } from './parser';
import { layoutIR } from './layout';
import { renderFull } from './renderer';

async function main() {
  const mount = document.getElementById('mount') as HTMLElement;
  try {
    const fixture = new URLSearchParams(location.search).get('fixture') ?? 'fixture.mmd';
    const src = await fetch(`./${fixture}`).then((r) => r.text());
    const ir = await parseFixture(src);
    layoutIR(ir);
    renderFull(ir, mount);
  } catch (err) {
    mount.innerHTML = `<pre style="color:#a00;white-space:pre-wrap">${(err as Error).stack ?? String(err)}</pre>`;
    console.error(err);
  }
}

main();
