/** Veritas design system: tokens in tokens.css, components here. */

export { Button, Chip, Label, Card, Panel, Skeleton, VerdictChip, Field, Rule } from "./components/primitives";

export { StageStrip, STAGES } from "./components/stage";
export type { Stage, StageState } from "./components/stage";

export { DataTable, Tabs, Drawer } from "./components/data";
export type { Column } from "./components/data";

export {
  Typewriter,
  CountUp,
  Waveform,
  GridBackground,
  ThemeToggle,
  useTheme,
  useReducedMotion,
} from "./components/motion";

export { Sparkline, BarRow, VarianceStrip, MonthBars, ShareBar, Delta } from "./components/viz";
export type { Reading, Bucket } from "./components/viz";

export { ProvenanceScope, Figure, ProvenanceTrail } from "./components/provenance";
export type { Provenance } from "./components/provenance";

export { WhatIf, AdversarialAudit, TimeScrub } from "./components/inquiry";
export type { Axis, Attack } from "./components/inquiry";

export { formatIndian, rupees } from "./format";
