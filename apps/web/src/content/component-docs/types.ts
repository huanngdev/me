export type PropDoc = { name: string; type: string; default: string; description: string };
export type ExampleDoc = {
  title: string;
  description?: string;
  code: string;
  language?: "tsx" | "ts" | "css";
};
export type NoteDoc = { title: string; items: readonly string[] };
export type ComponentDocs = {
  /** 4-8 lowercase words a user might type to find this component, e.g. "background", "music". */
  keywords: readonly string[];
  /** The main usage snippet (the one shown in the page's Usage section). */
  usage: string;
  /** Other snippets the page shows (extra demos, hooks, variants). */
  examples: readonly ExampleDoc[];
  props: readonly PropDoc[];
  /** Public types, as TypeScript source. */
  types: string;
  /** Plain-text bullet lists the page shows, e.g. features or keyboard shortcuts. */
  notes: readonly NoteDoc[];
};
