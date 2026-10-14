import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CliCommand } from "@repo/core/components/cli-command/cli-command";
import { CodeBlock } from "@repo/core/components/code-block";
import { ComponentDemo } from "@repo/core/components/component-demo";
import { PageHeader } from "@repo/core/components/layouts/page-header";
import { Separator } from "@repo/core/components/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/core/components/table";
import { TOCMinimap, type TOCItemType } from "@repo/core/components/toc-minimap";

import { readLlmsDocument } from "@/lib/read-llms-document";
import { RegistryInstall } from "@/components/registry-install";

import { BasicAudioPlayerDemo } from "./demo";

const LLM_TEXT = readLlmsDocument("components", "audio-player");

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const AUDIO_PLAYER_SOURCE = readFileSync(
  path.join(REPO_ROOT, "packages/core/src/components/audio-player/audio-player.tsx"),
  "utf8",
).replace('import { cn } from "../../lib/utils";', 'import { cn } from "@/lib/utils";');
const VIDEO_PLAYER_HOOK_SOURCE = readFileSync(
  path.join(REPO_ROOT, "packages/core/src/components/video-player/use-video-player.ts"),
  "utf8",
);

const TOC: TOCItemType[] = [
  { title: "Demo", url: "#demo", depth: 2 },
  { title: "Install", url: "#install", depth: 2 },
  { title: "Usage", url: "#usage", depth: 2 },
  { title: "Features", url: "#features", depth: 2 },
  { title: "Keyboard", url: "#keyboard", depth: 2 },
  { title: "Props", url: "#props", depth: 2 },
  { title: "Types", url: "#types", depth: 2 },
  { title: "Browser limits", url: "#limits", depth: 2 },
];

const DESCRIPTION =
  "A compact audio player with shadcn controls, built on the Video Player engine.";

export const metadata: Metadata = {
  title: "Audio Player",
  description: DESCRIPTION,
  alternates: { canonical: "/components/audio-player" },
  openGraph: {
    title: "Audio Player",
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Audio Player",
    description: DESCRIPTION,
  },
};

const INSTALL_PACKAGES = "@vidstack/react@next lucide-react";
const SHADCN_TARGET = "shadcn@latest add button dropdown-menu slider tooltip";
const STYLE_IMPORTS = `@import "@vidstack/react/player/styles/base.css";`;

const USAGE_CODE = `"use client";

import { AudioPlayer } from "@/components/audio-player/audio-player";

export function Example() {
  return (
    <AudioPlayer
      title="Field recording"
      src={{ src: "/audio/recording.mp3", type: "audio/mpeg" }}
      download
    />
  );
}`;

const TYPES_CODE = `type AudioPlayerProps = Omit<
  MediaPlayerProps,
  "children" | "className" | "controls" | "src" | "title" | "viewType"
> & {
  src: MediaPlayerProps["src"];
  title: string;
  playbackRates?: readonly number[];
  download?: boolean | string;
  className?: string;
};`;

const KEYBOARD_SHORTCUTS = [
  { keys: "Space / K", action: "Play or pause" },
  { keys: "J / ←", action: "Seek backward" },
  { keys: "L / →", action: "Seek forward" },
  { keys: "M", action: "Mute or unmute" },
] as const;

const FEATURES = [
  "Play, pause, and replay after the end",
  "Seek slider whose thumb announces the current time of the total",
  "Mute button and volume slider, hidden on the narrowest screens",
  "Playback speed menu from 0.5× to 2×, configurable",
  "Download link for direct files, opt-in",
  "Loading, buffering, and playback-error states inside the same row",
  "Tabular times and a single row that works from 280px wide",
  "Keyboard shortcuts scoped to the focused player",
] as const;

const PROPS = [
  {
    name: "src",
    type: "PlayerSrc",
    default: "—",
    description: "A direct audio file, or an object with an explicit MIME type.",
  },
  {
    name: "title",
    type: "string",
    default: "—",
    description: "Accessible name of the player and Media Session title.",
  },
  {
    name: "playbackRates",
    type: "readonly number[]",
    default: "0.5–2×",
    description: "Rates listed in the options menu.",
  },
  {
    name: "download",
    type: "boolean | string",
    default: "false",
    description: "Shows download for the source, or uses an explicit download URL.",
  },
  {
    name: "crossOrigin",
    type: 'MediaPlayerProps["crossOrigin"]',
    default: "true",
    description: "Set null to play cross-origin files that send no CORS headers.",
  },
  {
    name: "load",
    type: '"eager" | "idle" | "visible" | "play" | "custom"',
    default: '"visible"',
    description: "Controls when the media provider begins loading.",
  },
  {
    name: "className",
    type: "string",
    default: "—",
    description: "Classes applied to the player root.",
  },
] as const;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="px-4 py-8 sm:px-6 lg:px-8">
      {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Step({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative pl-9">
      <span className="bg-muted text-muted-foreground absolute top-0 left-0 inline-flex size-6 items-center justify-center rounded-md border font-mono text-xs">
        {index}
      </span>
      <h3 className="text-sm font-medium">{title}</h3>
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function CheckMark() {
  return (
    <span className="bg-secondary text-secondary-foreground mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full">
      <span aria-hidden="true">✓</span>
    </span>
  );
}

export default function AudioPlayerPage() {
  return (
    <>
      <div
        aria-label="Section navigation"
        className="pointer-events-none fixed top-1/2 left-4 z-30 hidden -translate-y-1/2 xl:block"
      >
        <div className="pointer-events-auto">
          <TOCMinimap items={TOC} />
        </div>
      </div>

      <PageHeader title="Audio Player" description={DESCRIPTION} />

      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <Section id="demo">
          <ComponentDemo llm={LLM_TEXT} code={USAGE_CODE} previewClassName="max-w-3xl">
            <BasicAudioPlayerDemo />
          </ComponentDemo>
        </Section>
        <Separator />

        <Section
          id="install"
          title="Install"
          description="Install with one shadcn command, or add the files by hand."
        >
          <RegistryInstall name="audio-player" />
          <details className="group">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium">
              Manual installation
            </summary>
            <div className="mt-6">
              <div className="space-y-8">
                <Step
                  index={1}
                  title="Install the media engine"
                  description="Vidstack provides the headless player, the same engine as the Video Player."
                >
                  <CliCommand install={INSTALL_PACKAGES} />
                </Step>
                <Step
                  index={2}
                  title="Add shadcn primitives"
                  description="The visible controls use your existing theme tokens."
                >
                  <CliCommand execute={SHADCN_TARGET} />
                </Step>
                <Step
                  index={3}
                  title="Import the media base styles"
                  description="Add this line to your global stylesheet."
                >
                  <CodeBlock code={STYLE_IMPORTS} language="css" />
                </Step>
                <Step
                  index={4}
                  title="Copy the Video Player hook"
                  description="The audio player shares it for playback state and time formatting. Save as components/video-player/use-video-player.ts."
                >
                  <CodeBlock code={VIDEO_PLAYER_HOOK_SOURCE} language="ts" />
                </Step>
                <Step
                  index={5}
                  title="Copy the player"
                  description="Save as components/audio-player/audio-player.tsx."
                >
                  <CodeBlock code={AUDIO_PLAYER_SOURCE} language="tsx" />
                </Step>
              </div>
            </div>
          </details>
        </Section>
        <Separator />

        <Section
          id="usage"
          title="Usage"
          description="Pass a title and a source. The download link and playback rates are optional."
        >
          <CodeBlock code={USAGE_CODE} language="tsx" />
        </Section>
        <Separator />

        <Section id="features" title="Features">
          <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex gap-2 text-sm leading-relaxed">
                <CheckMark />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Separator />

        <Section
          id="keyboard"
          title="Keyboard"
          description="Shortcuts apply while focus is inside the player. Tab reaches every control."
        >
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keys</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {KEYBOARD_SHORTCUTS.map((shortcut) => (
                  <TableRow key={shortcut.keys}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {shortcut.keys}
                    </TableCell>
                    <TableCell>{shortcut.action}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
        <Separator />

        <Section
          id="props"
          title="Props"
          description="The remaining Vidstack MediaPlayer props pass through."
        >
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prop</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PROPS.map((prop) => (
                  <TableRow key={prop.name}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {prop.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground min-w-48 font-mono text-xs">
                      {prop.type}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                      {prop.default}
                    </TableCell>
                    <TableCell className="min-w-72 text-sm">{prop.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
        <Separator />

        <Section id="types" title="Types">
          <CodeBlock code={TYPES_CODE} language="ts" />
        </Section>
        <Separator />

        <Section
          id="limits"
          title="Browser limits"
          description="A player can normalize controls, but it cannot change what the browser can decode."
        >
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              The file must be in a format the browser can decode, such as MP3, WAV, Ogg, or AAC in
              M4A. Cross-origin files need CORS headers unless <code>crossOrigin</code> is set to
              null, which plays them without letting scripts read the audio.
            </p>
            <p>
              Adaptive streams are not configured by this component. Use the Video Player for HLS or
              DASH.
            </p>
            <a
              href="https://vidstack.io/docs/player/core-concepts/loading/"
              target="_blank"
              rel="noreferrer"
              className="hover:bg-muted inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors"
            >
              Vidstack source documentation
            </a>
          </div>
        </Section>
      </article>
    </>
  );
}
