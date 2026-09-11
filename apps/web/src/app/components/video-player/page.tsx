import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

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
import { TerminalBlock } from "@repo/core/components/terminal-block";
import { TOCMinimap, type TOCItemType } from "@repo/core/components/toc-minimap";

import { BasicVideoPlayerDemo, SourceSwitcherDemo } from "./demo";

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const VIDEO_PLAYER_SOURCE = readFileSync(
  path.join(REPO_ROOT, "packages/core/src/components/video-player/video-player.tsx"),
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
  { title: "Streaming sources", url: "#sources", depth: 2 },
  { title: "Features", url: "#features", depth: 2 },
  { title: "Keyboard", url: "#keyboard", depth: 2 },
  { title: "Props", url: "#props", depth: 2 },
  { title: "Types", url: "#types", depth: 2 },
  { title: "Browser limits", url: "#limits", depth: 2 },
];

const DESCRIPTION =
  "A headless video player with shadcn controls for files, adaptive streams, and embeds.";

export const metadata: Metadata = {
  title: "Video Player",
  description: DESCRIPTION,
  alternates: { canonical: "/components/video-player" },
  openGraph: {
    title: "Video Player",
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Video Player",
    description: DESCRIPTION,
  },
};

const INSTALL_COMMAND = `bun add @vidstack/react@next hls.js dashjs lucide-react`;
const SHADCN_COMMAND = `bunx --bun shadcn@latest add button dropdown-menu slider tooltip`;
const STYLE_IMPORTS = `@import "@vidstack/react/player/styles/base.css";
@import "@vidstack/react/player/styles/default/captions.css";`;

const USAGE_CODE = `"use client";

import { VideoPlayer } from "@/components/ui/video-player/video-player";

export function Example() {
  return (
    <VideoPlayer
      title="Sprite Fight"
      src={{
        src: "https://files.vidstack.io/sprite-fight/720p.mp4",
        type: "video/mp4",
      }}
      poster="https://files.vidstack.io/sprite-fight/poster.webp"
      tracks={[
        {
          id: "english",
          src: "/captions/english.vtt",
          kind: "subtitles",
          label: "English",
          lang: "en-US",
          type: "vtt",
          default: true,
        },
        {
          id: "chapters",
          src: "/captions/chapters.vtt",
          kind: "chapters",
          label: "Chapters",
          lang: "en-US",
          type: "vtt",
        },
      ]}
      download
    />
  );
}`;

const SOURCE_SWITCHER_CODE = `"use client";

import { useState } from "react";
import { VideoPlayer, type VideoPlayerProps } from "@/components/ui/video-player/video-player";

const sources = [
  {
    label: "MP4",
    src: { src: "https://example.com/video.mp4", type: "video/mp4" },
  },
  {
    label: "HLS",
    src: { src: "https://example.com/master.m3u8", type: "application/x-mpegurl" },
  },
  {
    label: "DASH",
    src: { src: "https://example.com/manifest.mpd", type: "application/dash+xml" },
  },
] satisfies { label: string; src: VideoPlayerProps["src"] }[];

export function StreamingExample() {
  const [index, setIndex] = useState(0);
  const source = sources[index] ?? sources[0]!;

  return <VideoPlayer key={source.label} title={source.label} src={source.src} />;
}`;

const SOURCE_EXAMPLES = `// Direct file or CDN object
const file = { src: "https://cdn.example.com/video.mp4", type: "video/mp4" };

// Adaptive streaming
const hls = { src: "https://cdn.example.com/master.m3u8", type: "application/x-mpegurl" };
const dash = { src: "https://cdn.example.com/manifest.mpd", type: "application/dash+xml" };

// Provider embeds — the provider's policies still apply
const youtube = { src: "https://www.youtube.com/watch?v=VIDEO_ID", type: "video/youtube" };
const vimeo = { src: "https://vimeo.com/VIDEO_ID", type: "video/vimeo" };

// Multiple file qualities
const qualities = [
  { src: "/video-1080.mp4", type: "video/mp4", width: 1920, height: 1080 },
  { src: "/video-720.mp4", type: "video/mp4", width: 1280, height: 720 },
];`;

const TYPES_CODE = `type VideoPlayerTrack = Omit<TrackProps, "id"> & {
  id: string;
};

type VideoPlayerProps = Omit<
  MediaPlayerProps,
  "children" | "className" | "controls" | "src" | "title"
> & {
  src: MediaPlayerProps["src"];
  title: string;
  tracks?: VideoPlayerTrack[];
  playbackRates?: readonly number[];
  skipSeconds?: number;
  download?: boolean | string;
  className?: string;
};`;

const KEYBOARD_SHORTCUTS = [
  { keys: "Space / K", action: "Play or pause" },
  { keys: "J / ←", action: "Seek backward" },
  { keys: "L / →", action: "Seek forward" },
  { keys: "↑ / ↓", action: "Raise or lower volume" },
  { keys: "M", action: "Mute or unmute" },
  { keys: "C", action: "Toggle captions" },
  { keys: "F", action: "Toggle fullscreen" },
  { keys: "I", action: "Toggle picture in picture" },
  { keys: "< / >", action: "Lower or raise playback speed" },
] as const;

const FEATURES = [
  "Play, pause, replay, and configurable skip controls",
  "Seek slider with played and buffered progress",
  "Volume, mute, persisted preferences, and playback speed",
  "HLS and DASH adaptive quality selection",
  "Caption tracks, chapter titles, and multiple audio tracks",
  "Live and DVR streams with return-to-live control",
  "Fullscreen, picture in picture, AirPlay, and Google Cast when supported",
  "MP4, WebM, HLS, DASH, YouTube, Vimeo, Blob, and MediaStream providers",
  "Loading, buffering, ended, autoplay-failure, and playback-error states",
  "Keyboard shortcuts, focus states, tooltips, and screen-reader announcements",
  "Lazy media and poster loading with reduced-motion-safe transitions",
  "Responsive controls designed for a 360px viewport",
] as const;

const PROPS = [
  {
    name: "src",
    type: "PlayerSrc",
    default: "—",
    description: "One source or an ordered list of file, stream, object, or embed sources.",
  },
  {
    name: "title",
    type: "string",
    default: "—",
    description: "Required accessible title and Media Session title.",
  },
  {
    name: "poster",
    type: "string",
    default: "—",
    description: "Poster image displayed before playback starts.",
  },
  {
    name: "tracks",
    type: "VideoPlayerTrack[]",
    default: "[]",
    description: "Caption, subtitle, chapter, metadata, or description tracks.",
  },
  {
    name: "playbackRates",
    type: "readonly number[]",
    default: "0.5–2×",
    description: "Rates displayed in the playback settings menu.",
  },
  {
    name: "skipSeconds",
    type: "number",
    default: "10",
    description: "Seconds used by the backward and forward buttons.",
  },
  {
    name: "download",
    type: "boolean | string",
    default: "false",
    description: "Shows download for direct sources, or uses an explicit download URL.",
  },
  {
    name: "load",
    type: '"eager" | "idle" | "visible" | "play" | "custom"',
    default: '"visible"',
    description: "Controls when the media provider begins loading.",
  },
  {
    name: "streamType",
    type: "MediaStreamType",
    default: '"unknown"',
    description: "Declare live, low-latency live, or DVR behavior when it cannot be inferred.",
  },
  {
    name: "storage",
    type: "string | MediaStorage | null",
    default: "null",
    description: "Persists volume, captions, time, speed, and quality preferences.",
  },
  {
    name: "className",
    type: "string",
    default: "—",
    description: "Classes applied to the player root.",
  },
] as const;

const SOURCE_SUPPORT = [
  {
    source: "MP4, WebM, audio files",
    support: "Direct",
    note: "The browser must support the container and codecs.",
  },
  {
    source: "HLS (.m3u8)",
    support: "Adaptive and live",
    note: "Uses native HLS or the locally bundled hls.js engine.",
  },
  {
    source: "MPEG-DASH (.mpd)",
    support: "Adaptive and live",
    note: "Uses the locally bundled dash.js engine.",
  },
  {
    source: "YouTube and Vimeo",
    support: "Embed adapter",
    note: "Provider branding, policies, and feature restrictions still apply.",
  },
  {
    source: "Blob, File, MediaStream",
    support: "Object source",
    note: "Useful for uploads, cameras, screen sharing, and generated media.",
  },
  {
    source: "RTMP, RTSP, SRT",
    support: "Server conversion",
    note: "Convert to HLS, DASH, or WebRTC before browser playback.",
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

export default function VideoPlayerPage() {
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

      <PageHeader title="Video Player" description={DESCRIPTION} />

      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <Section id="demo">
          <ComponentDemo code={USAGE_CODE} previewClassName="max-w-3xl">
            <BasicVideoPlayerDemo />
          </ComponentDemo>
        </Section>
        <Separator />

        <Section
          id="install"
          title="Install"
          description="Add the playback engines, shadcn primitives, styles, hook, and component."
        >
          <div className="space-y-8">
            <Step
              index={1}
              title="Install media dependencies"
              description="Vidstack provides the headless player; hls.js and dash.js stay local."
            >
              <TerminalBlock command={INSTALL_COMMAND} />
            </Step>
            <Step
              index={2}
              title="Add shadcn primitives"
              description="The visible controls use your existing theme tokens."
            >
              <TerminalBlock command={SHADCN_COMMAND} />
            </Step>
            <Step
              index={3}
              title="Import media styles"
              description="Add these lines to your global stylesheet."
            >
              <CodeBlock code={STYLE_IMPORTS} language="css" />
            </Step>
            <Step
              index={4}
              title="Copy the state hook"
              description="Save as components/ui/video-player/use-video-player.ts."
            >
              <CodeBlock code={VIDEO_PLAYER_HOOK_SOURCE} language="ts" />
            </Step>
            <Step
              index={5}
              title="Copy the player"
              description="Save as components/ui/video-player/video-player.tsx."
            >
              <CodeBlock code={VIDEO_PLAYER_SOURCE} language="tsx" />
            </Step>
          </div>
        </Section>
        <Separator />

        <Section
          id="usage"
          title="Usage"
          description="Pass a title and source. Tracks and every playback option are additive."
        >
          <CodeBlock code={USAGE_CODE} language="tsx" />
        </Section>
        <Separator />

        <Section
          id="sources"
          title="Streaming sources"
          description="The provider is selected from the source URL or explicit MIME type."
        >
          <div className="space-y-6">
            <ComponentDemo code={SOURCE_SWITCHER_CODE} previewClassName="max-w-3xl">
              <SourceSwitcherDemo />
            </ComponentDemo>
            <CodeBlock code={SOURCE_EXAMPLES} language="ts" />
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Requirement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SOURCE_SUPPORT.map((item) => (
                    <TableRow key={item.source}>
                      <TableCell className="font-medium whitespace-nowrap">{item.source}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {item.support}
                      </TableCell>
                      <TableCell className="min-w-72 text-sm">{item.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
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
          description="Shortcuts are scoped to the most recently active player."
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
          description="All remaining Vidstack MediaPlayer props and typed events pass through."
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
          description="A player can normalize APIs, but it cannot bypass the browser or source owner."
        >
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              Direct files and adaptive manifests need valid CORS headers, MIME types, byte-range
              support, and codecs the browser can decode. DRM streams additionally require an EME
              license flow and are not unlocked by this component.
            </p>
            <p>
              YouTube and Vimeo run through their official embed providers. Their branding,
              advertising, availability, and control restrictions remain in effect. RTMP, RTSP, and
              SRT are ingest protocols and must be converted to a browser delivery format.
            </p>
            <a
              href="https://vidstack.io/docs/player/core-concepts/loading/"
              target="_blank"
              rel="noreferrer"
              className="hover:bg-muted inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors"
            >
              Vidstack source documentation
              <ExternalLink className="size-4" />
            </a>
          </div>
        </Section>
      </article>
    </>
  );
}

function CheckMark() {
  return (
    <span className="bg-secondary text-secondary-foreground mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full">
      <span aria-hidden="true">✓</span>
    </span>
  );
}
