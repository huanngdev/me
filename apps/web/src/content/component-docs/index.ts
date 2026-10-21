import type { ComponentDocs } from "./types";
import { DOCS as asciiOcean } from "./ascii-ocean";
import { DOCS as audioPlayer } from "./audio-player";
import { DOCS as cliCommand } from "./cli-command";
import { DOCS as githubContributions3d } from "./github-contributions-3d";
import { DOCS as scrollMinimap } from "./scroll-minimap";
import { DOCS as shadcnTagsInput } from "./shadcn-tags-input";
import { DOCS as tileTreemap } from "./tile-treemap";
import { DOCS as videoPlayer } from "./video-player";
import { DOCS as zodDataTable } from "./zod-data-table";

export const COMPONENT_DOCS = {
  "ascii-ocean": asciiOcean,
  "audio-player": audioPlayer,
  "cli-command": cliCommand,
  "github-contributions-3d": githubContributions3d,
  "scroll-minimap": scrollMinimap,
  "shadcn-tags-input": shadcnTagsInput,
  "tile-treemap": tileTreemap,
  "video-player": videoPlayer,
  "zod-data-table": zodDataTable,
} satisfies Record<string, ComponentDocs>;

export type ComponentDocsSlug = keyof typeof COMPONENT_DOCS;
export type { ComponentDocs, PropDoc, ExampleDoc, NoteDoc } from "./types";
