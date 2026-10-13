"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode, type RefObject } from "react";
import { MediaAnnouncer, MediaPlayer, MediaProvider, type MediaPlayerProps } from "@vidstack/react";
import {
  Download,
  EllipsisVertical,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button } from "../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import { Slider } from "../slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../tooltip";
import { cn } from "../../lib/utils";
import { formatMediaTime, useVideoPlayer } from "../video-player/use-video-player";

const DEFAULT_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const KEY_SHORTCUTS = {
  togglePaused: "k Space",
  toggleMuted: "m",
  seekBackward: "j J ArrowLeft",
  seekForward: "l L ArrowRight",
};

export type AudioPlayerProps = Omit<
  MediaPlayerProps,
  "children" | "className" | "controls" | "src" | "title" | "viewType"
> & {
  src: MediaPlayerProps["src"];
  title: string;
  playbackRates?: readonly number[];
  download?: boolean | string;
  className?: string;
};

// Audio files are direct sources, so the download link is the file itself or an explicit url.
function getDownloadHref(
  source: AudioPlayerProps["src"],
  download: AudioPlayerProps["download"],
): string | null {
  if (typeof download === "string") return download;
  if (!download) return null;

  const firstSource = Array.isArray(source) ? source[0] : source;
  if (typeof firstSource === "string") return firstSource;
  if (!firstSource || typeof firstSource.src !== "string") return null;

  return firstSource.src;
}

// The shadcn slider labels its root only. Radix names a thumb from its own props, and a slider with one
// value gets no name, so the thumb's name and time text are set on it after each render.
function useSliderThumbAria(
  rootRef: RefObject<HTMLElement | null>,
  label: string,
  valueText: string,
): void {
  useEffect(() => {
    rootRef.current?.querySelectorAll('[role="slider"]').forEach((thumb) => {
      thumb.setAttribute("aria-label", label);
      thumb.setAttribute("aria-valuetext", valueText);
    });
  });
}

function BarButton({
  label,
  children,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn("shrink-0", className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function OptionsMenu({
  player,
  playbackRates,
  downloadHref,
  disabled,
}: {
  player: ReturnType<typeof useVideoPlayer>;
  playbackRates: readonly number[];
  downloadHref: string | null;
  disabled: boolean;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="More options"
              disabled={disabled}
              className="shrink-0"
            >
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          More options
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" side="top" sideOffset={8}>
        <DropdownMenuLabel>Playback speed</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={String(player.media.playbackRate)}>
          {playbackRates.map((rate) => (
            <DropdownMenuRadioItem
              key={rate}
              value={String(rate)}
              disabled={!player.media.canSetPlaybackRate}
              onSelect={() => player.changePlaybackRate(rate)}
            >
              {rate === 1 ? "Normal" : `${rate}×`}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {downloadHref && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={downloadHref} download>
                <Download />
                Download
              </a>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AudioBar({
  title,
  playbackRates,
  downloadHref,
}: {
  title: string;
  playbackRates: readonly number[];
  downloadHref: string | null;
}) {
  const player = useVideoPlayer();
  const { media } = player;
  const seekRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  const failed = Boolean(media.error);
  const loading = !failed && !media.canPlay;
  const playLabel = loading ? "Loading" : media.ended ? "Replay" : media.paused ? "Play" : "Pause";
  const volumeLabel = media.muted ? "Unmute" : "Mute";
  const VolumeIcon = media.muted ? VolumeX : media.volume < 0.5 ? Volume1 : Volume2;
  const volumePercent = Math.round((media.muted ? 0 : media.volume) * 100);

  useSliderThumbAria(
    seekRef,
    "Audio progress",
    `${formatMediaTime(player.seekValue)} of ${formatMediaTime(player.seekMax)}`,
  );
  useSliderThumbAria(volumeRef, "Volume", `${volumePercent}%`);

  let playIcon: ReactNode;
  if (media.ended) playIcon = <RotateCcw />;
  else if (media.paused) playIcon = <Play className="fill-current" />;
  else playIcon = <Pause className="fill-current" />;
  if (loading || (media.waiting && !media.paused)) {
    playIcon = <LoaderCircle className="animate-spin motion-reduce:animate-none" />;
  }

  return (
    <TooltipProvider>
      <div
        role="group"
        aria-label={title}
        className="flex h-14 w-full items-center gap-1 px-3 @sm/audio-player:gap-2 @sm/audio-player:px-4"
      >
        <BarButton label={playLabel} onClick={player.togglePlayback} disabled={failed || loading}>
          {playIcon}
        </BarButton>

        {failed ? (
          <p role="alert" className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
            {"This audio can't be played."}
          </p>
        ) : (
          <>
            <span className="text-muted-foreground shrink-0 text-right font-mono text-xs tabular-nums">
              {formatMediaTime(media.currentTime)}
            </span>
            <div ref={seekRef} className="flex min-w-0 flex-1">
              <Slider
                min={player.seekMin}
                max={Math.max(player.seekMax, player.seekMin + 0.01)}
                step={0.1}
                value={[player.seekValue]}
                disabled={!media.canSeek}
                onValueChange={player.previewSeek}
                onValueCommit={player.commitSeek}
                className="cursor-pointer"
              />
            </div>
            <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
              {formatMediaTime(media.duration)}
            </span>
          </>
        )}

        <BarButton label={volumeLabel} onClick={player.toggleMuted} disabled={failed}>
          <VolumeIcon />
        </BarButton>
        <div ref={volumeRef} className="hidden w-20 shrink-0 @sm/audio-player:flex">
          <Slider
            min={0}
            max={100}
            step={1}
            value={[volumePercent]}
            disabled={failed || !media.canSetVolume}
            onValueChange={player.changeVolume}
          />
        </div>

        <OptionsMenu
          player={player}
          playbackRates={playbackRates}
          downloadHref={downloadHref}
          disabled={failed}
        />
      </div>
    </TooltipProvider>
  );
}

// A compact audio player: one row of shadcn controls over the vidstack engine, with no visible surface.
export function AudioPlayer({
  src,
  title,
  playbackRates = DEFAULT_PLAYBACK_RATES,
  download = false,
  className,
  crossOrigin = true,
  load = "visible",
  preload = "metadata",
  keyTarget = "player",
  keyShortcuts = KEY_SHORTCUTS,
  ...playerProps
}: AudioPlayerProps) {
  const downloadHref = getDownloadHref(src, download);

  return (
    <MediaPlayer
      src={src}
      title={title}
      viewType="audio"
      crossOrigin={crossOrigin}
      load={load}
      preload={preload}
      keyTarget={keyTarget}
      keyShortcuts={keyShortcuts}
      className={cn(
        "group/audio-player bg-background text-foreground focus-visible:ring-ring/50 @container/audio-player relative isolate block w-full min-w-0 rounded-full border outline-none focus-visible:ring-3",
        className,
      )}
      {...playerProps}
    >
      <MediaProvider />
      <MediaAnnouncer />
      <AudioBar title={title} playbackRates={playbackRates} downloadHref={downloadHref} />
    </MediaPlayer>
  );
}
