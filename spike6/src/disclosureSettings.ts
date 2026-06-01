// The minimal "mode manager" for the progressive-disclosure family (SPEC §2).
// One live-mutable field holds the active interaction state. Focus (Step 2) and
// path (Step 3) are mutually exclusive precisely because both read and write
// this single field — entering one leaves the other. `default` is today's
// behaviour (collapse on subgraph-click, drag on node-press).
//
// Mirrors the shape of `edgeSettings.ts` / `astarSettings.ts`: a plain exported
// singleton, no framework, no store.

export type DisclosureMode = 'default' | 'focus' | 'path';

export interface DisclosureSettings {
  mode: DisclosureMode;
}

export const disclosureSettings: DisclosureSettings = {
  mode: 'default',
};
