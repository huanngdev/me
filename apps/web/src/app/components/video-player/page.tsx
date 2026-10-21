import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import { CliCommand } from "@repo/core/components/cli-command/cli-command";
import { CodeBlock } from "@repo/core/components/code-block";
import { ComponentDemo } from "@repo/core/components/component-demo";
import { ComponentPreviewFrame } from "@repo/core/components/layouts/component-preview-frame";
import { Separator } from "@repo/core/components/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/core/components/table";

import { readSourceFiles } from "@/lib/read-source-files";
import { RegistryInstall } from "@/components/registry-install";

import { BasicVideoPlayerDemo, SourceSwitcherDemo } from "./demo";
import { DOCS } from "@/content/component-docs/video-player";

const SOURCE_FILES = readSourceFiles([
  "packages/core/src/components/video-player/use-video-player.ts",
  "packages/core/src/components/video-player/video-player.tsx",
]);

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

const INSTALL_PACKAGES = "@vidstack/react@next hls.js dashjs lucide-react";
const SHADCN_TARGET = "shadcn@latest add button dropdown-menu slider tooltip";
const STYLE_IMPORTS = `@import "@vidstack/react/player/styles/base.css";
@import "@vidstack/react/player/styles/default/captions.css";`;

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
    <section id={id} className="py-8">
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
    <ComponentPreviewFrame
      name="video-player"
      files={SOURCE_FILES}
      previewClassName="max-w-3xl"
      docs={<Docs />}
    >
      <BasicVideoPlayerDemo />
    </ComponentPreviewFrame>
  );
}

function Docs() {
  return (
    <>
      <header className="pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Video Player</h1>
        <p className="text-muted-foreground mt-1 text-sm">{DESCRIPTION}</p>
      </header>

      <Section
        id="install"
        title="Install"
        description="Install with one shadcn command, or add the files by hand."
      >
        <RegistryInstall name="video-player" />
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium">
            Manual installation
          </summary>
          <div className="mt-6">
            <div className="space-y-8">
              <Step
                index={1}
                title="Install media dependencies"
                description="Vidstack provides the headless player; hls.js and dash.js stay local."
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
                title="Import media styles"
                description="Add these lines to your global stylesheet."
              >
                <CodeBlock code={STYLE_IMPORTS} language="css" />
              </Step>
              <Step
                index={4}
                title="Copy the state hook"
                description="Save as components/video-player/use-video-player.ts."
              >
                <CodeBlock code={VIDEO_PLAYER_HOOK_SOURCE} language="ts" />
              </Step>
              <Step
                index={5}
                title="Copy the player"
                description="Save as components/video-player/video-player.tsx."
              >
                <CodeBlock code={VIDEO_PLAYER_SOURCE} language="tsx" />
              </Step>
            </div>
          </div>
        </details>
      </Section>
      <Separator />

      <Section
        id="usage"
        title="Usage"
        description="Pass a title and source. Tracks and every playback option are additive."
      >
        <CodeBlock code={DOCS.usage} language="tsx" />
      </Section>
      <Separator />

      <Section
        id="sources"
        title="Streaming sources"
        description="The provider is selected from the source URL or explicit MIME type."
      >
        <div className="space-y-6">
          <ComponentDemo code={DOCS.examples[0]!.code} previewClassName="max-w-3xl">
            <SourceSwitcherDemo />
          </ComponentDemo>
          <CodeBlock code={DOCS.examples[1]!.code} language="ts" />
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
          {DOCS.notes[0]!.items.map((feature) => (
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
              {DOCS.props.map((prop) => (
                <TableRow key={prop.name}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{prop.name}</TableCell>
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
        <CodeBlock code={DOCS.types} language="ts" />
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
