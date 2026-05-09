// One-shot script: generate fixture-200.mmd — a realistic ~200-node service-mesh
// flowchart with subgraph nesting and mixed edge density. Run with: node generate-large-fixture.mjs
import { writeFile } from 'node:fs/promises';

const DOMAINS = [
  ['Web', ['Auth', 'Session']],
  ['Mobile', ['Push', 'Telemetry']],
  ['Orders', ['Cart', 'Checkout']],
  ['Payments', ['Billing', 'Fraud']],
  ['Inventory', ['Catalog', 'Stock']],
  ['Shipping', ['Routing', 'Tracking']],
  ['Notifications', ['Email', 'SMS']],
  ['Analytics', ['Ingest', 'Reporting']],
];

let nodeIdCounter = 0;
const nextId = (prefix) => `${prefix}${String(++nodeIdCounter).padStart(3, '0')}`;

const lines = ['flowchart TD', ''];
const allNodes = []; // { id, domain, sub, label, kind }

// Top-level entrypoint
lines.push('    Client[Client App]');
lines.push('    Edge[Edge Gateway]');
allNodes.push({ id: 'Client', kind: 'leaf', domain: null, sub: null });
allNodes.push({ id: 'Edge', kind: 'leaf', domain: null, sub: null });
lines.push('');

// Build domain → subdomain → leaves
for (const [domain, subs] of DOMAINS) {
  lines.push(`    subgraph ${domain}[${domain}]`);
  for (const sub of subs) {
    lines.push(`        subgraph ${domain}_${sub}[${sub}]`);
    // 11–13 leaves per subdomain → ~190 leaves across 16 subdomains; ~200 total with the prelude
    const count = 11 + (Math.floor(Math.random() * 3));
    for (let i = 0; i < count; i++) {
      const id = nextId(`${domain[0]}${sub[0]}`);
      const label = `${sub} ${i + 1}`;
      // Mix some shapes: every 5th is a DB (cylinder), every 7th is a queue (parallelogram)
      let decl;
      if (i % 7 === 6) decl = `${id}[/${label}/]`;
      else if (i % 5 === 4) decl = `${id}[(${label})]`;
      else decl = `${id}[${label}]`;
      lines.push(`            ${decl}`);
      allNodes.push({ id, kind: 'leaf', domain, sub });
    }
    lines.push('        end');
  }
  lines.push('    end');
  lines.push('');
}

// Edges: realistic-ish service mesh
// 1) Client → Edge → first node of each domain's first subdomain
const domainEntries = [];
for (const [domain, subs] of DOMAINS) {
  const firstSub = subs[0];
  const firstNode = allNodes.find((n) => n.domain === domain && n.sub === firstSub);
  if (firstNode) domainEntries.push(firstNode);
}
lines.push('    Client --> Edge');
for (const entry of domainEntries) lines.push(`    Edge --> ${entry.id}`);
lines.push('');

// 2) Within each subdomain: each node forwards to ~1–2 others in the same subdomain (chain-ish)
const seenEdges = new Set();
const addEdge = (a, b, opts = {}) => {
  if (a === b) return;
  const key = `${a}->${b}`;
  if (seenEdges.has(key)) return;
  seenEdges.add(key);
  if (opts.dotted) lines.push(`    ${a} -.->|${opts.label ?? 'sync'}| ${b}`);
  else if (opts.label) lines.push(`    ${a} -->|${opts.label}| ${b}`);
  else lines.push(`    ${a} --> ${b}`);
};

for (const [domain, subs] of DOMAINS) {
  for (const sub of subs) {
    const subNodes = allNodes.filter((n) => n.domain === domain && n.sub === sub);
    for (let i = 0; i < subNodes.length - 1; i++) {
      addEdge(subNodes[i].id, subNodes[i + 1].id);
      // Branching: every 3rd node also forwards to the +2 neighbor for some divergence
      if (i % 3 === 0 && i + 2 < subNodes.length) {
        addEdge(subNodes[i].id, subNodes[i + 2].id);
      }
    }
  }
}

// 3) Cross-subdomain edges within a domain: first node of sub2 ← last node of sub1
for (const [domain, subs] of DOMAINS) {
  for (let s = 0; s < subs.length - 1; s++) {
    const a = subs[s], b = subs[s + 1];
    const aNodes = allNodes.filter((n) => n.domain === domain && n.sub === a);
    const bNodes = allNodes.filter((n) => n.domain === domain && n.sub === b);
    if (aNodes.length && bNodes.length) {
      addEdge(aNodes[Math.floor(aNodes.length / 2)].id, bNodes[0].id);
    }
  }
}

// 4) Cross-domain edges: ~10% of total nodes get an edge to a node in a neighboring domain
const leafNodes = allNodes.filter((n) => n.kind === 'leaf' && n.domain);
const crossCount = Math.floor(leafNodes.length * 0.08);
for (let i = 0; i < crossCount; i++) {
  const src = leafNodes[Math.floor(Math.random() * leafNodes.length)];
  const dst = leafNodes[Math.floor(Math.random() * leafNodes.length)];
  if (src.domain !== dst.domain) addEdge(src.id, dst.id);
}

// 5) A few dotted "sync" edges between Orders and Payments for variety
const ordersNodes = leafNodes.filter((n) => n.domain === 'Orders');
const paymentsNodes = leafNodes.filter((n) => n.domain === 'Payments');
for (let i = 0; i < 3; i++) {
  if (ordersNodes[i] && paymentsNodes[i]) {
    addEdge(ordersNodes[i].id, paymentsNodes[i].id, { dotted: true, label: 'sync' });
  }
}

const out = lines.join('\n') + '\n';
await writeFile(new URL('./fixture-200.mmd', import.meta.url), out, 'utf8');
console.log(`Wrote fixture-200.mmd: ${allNodes.length} nodes, ${seenEdges.size} edges`);
