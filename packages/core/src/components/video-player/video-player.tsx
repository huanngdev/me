"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Captions as CaptionsDisplay,
  ChapterTitle,
  Controls,
  Gesture,
  isDASHProvider,
  isHLSProvider,
  MediaAnnouncer,
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
  type MediaPlayerProps,
  type MediaProviderAdapter,
  type TrackProps,
} from "@vidstack/react";
import {
  Airplay,
  Captions,
  Cast,
  Download,
  FastForward,
  Gauge,
  Languages,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  Rewind,
  RotateCcw,
  Settings,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button } from "../button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import { Slider } from "../slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../tooltip";
import { cn } from "../../lib/utils";
import { formatMediaTime, useVideoPlayer } from "./use-video-player";

const DEFAULT_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type VideoPlayerTrack = Omit<TrackProps, "id"> & {
  id: string;
};

export type VideoPlayerProps = Omit<
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
};

function configureMediaProvider(provider: MediaProviderAdapter | null): void {
  if (isHLSProvider(provider)) provider.library = () => import("hls.js");
  if (isDASHProvider(provider)) provider.library = () => import("dashjs");
}

function getDownloadHref(
  source: VideoPlayerProps["src"],
  download: VideoPlayerProps["download"],
): string | null {
  if (typeof download === "string") return download;
  if (!download) return null;

  const firstSource = Array.isArray(source) ? source[0] : source;
  if (typeof firstSource === "string") return firstSource;
  if (!firstSource || typeof firstSource.src !== "string") return null;
  if (firstSource.type === "video/youtube" || firstSource.type === "video/vimeo") return null;

  return firstSource.src;
}

function PlayerButton({
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
          className={cn("text-white drop-shadow-sm hover:bg-black/40 hover:text-white", className)}
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

function SettingsMenu({
  player,
  playbackRates,
  downloadHref,
}: {
  player: ReturnType<typeof useVideoPlayer>;
  playbackRates: readonly number[];
  downloadHref: string | null;
}) {
  const captions = player.media.textTracks.filter(
    (track) => track.kind === "captions" || track.kind === "subtitles",
  );

  return (
    <DropdownMenu onOpenChange={player.handleMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Playback settings"
          className="text-white drop-shadow-sm hover:bg-black/40 hover:text-white"
        >
          <Settings />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" sideOffset={8} className="min-w-56">
        <DropdownMenuLabel>Playback</DropdownMenuLabel>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="min-h-11">
            <Gauge />
            Speed
            <span className="text-muted-foreground ml-auto font-mono text-xs">
              {player.media.playbackRate}×
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-36">
            <DropdownMenuRadioGroup value={String(player.media.playbackRate)}>
              {playbackRates.map((rate) => (
                <DropdownMenuRadioItem
                  key={rate}
                  value={String(rate)}
                  className="min-h-11"
                  disabled={!player.media.canSetPlaybackRate}
                  onSelect={() => player.changePlaybackRate(rate)}
                >
                  {rate === 1 ? "Normal" : `${rate}×`}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {player.media.qualities.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="min-h-11">
              <Radio />
              Quality
              <span className="text-muted-foreground ml-auto font-mono text-xs">
                {player.media.autoQuality
                  ? "Auto"
                  : player.media.quality
                    ? `${player.media.quality.height}p`
                    : "—"}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-36">
              <DropdownMenuRadioGroup
                value={player.media.autoQuality ? "auto" : (player.media.quality?.id ?? "auto")}
              >
                <DropdownMenuRadioItem
                  value="auto"
                  className="min-h-11"
                  onSelect={() => player.changeQuality(-1)}
                >
                  Auto
                </DropdownMenuRadioItem>
                {player.media.qualities.map((quality, index) => (
                  <DropdownMenuRadioItem
                    key={quality.id}
                    value={quality.id}
                    className="min-h-11"
                    disabled={!player.media.canSetQuality}
                    onSelect={() => player.changeQuality(index)}
                  >
                    {quality.height}p
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {captions.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="min-h-11">
              <Languages />
              Captions
              <span className="text-muted-foreground ml-auto max-w-20 truncate text-xs">
                {player.media.textTrack?.label || "Off"}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-40">
              <DropdownMenuRadioGroup value={player.media.textTrack?.id ?? "off"}>
                <DropdownMenuRadioItem
                  value="off"
                  className="min-h-11"
                  onSelect={() => player.changeTextTrack(null)}
                >
                  Off
                </DropdownMenuRadioItem>
                {captions.map((track) => (
                  <DropdownMenuRadioItem
                    key={track.id}
                    value={track.id}
                    className="min-h-11"
                    onSelect={() => player.changeTextTrack(track.id)}
                  >
                    {track.label || track.language || "Captions"}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {player.media.audioTracks.length > 1 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="min-h-11">
              <Volume2 />
              Audio
              <span className="text-muted-foreground ml-auto max-w-20 truncate text-xs">
                {player.media.audioTrack?.label || "Default"}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-40">
              <DropdownMenuRadioGroup value={player.media.audioTrack?.id ?? ""}>
                {player.media.audioTracks.map((track, index) => (
                  <DropdownMenuRadioItem
                    key={track.id}
                    value={track.id}
                    className="min-h-11"
                    onSelect={() => player.changeAudioTrack(index)}
                  >
                    {track.label || track.language || `Track ${index + 1}`}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuCheckboxItem
          checked={player.media.loop}
          className="min-h-11"
          onCheckedChange={player.toggleLoop}
        >
          <RotateCcw />
          Loop
        </DropdownMenuCheckboxItem>

        {(player.media.canAirPlay || player.media.canGoogleCast || downloadHref) && (
          <DropdownMenuSeparator />
        )}

        {player.media.canAirPlay && (
          <DropdownMenuItem className="min-h-11" onSelect={player.requestAirPlay}>
            <Airplay />
            AirPlay
          </DropdownMenuItem>
        )}
        {player.media.canGoogleCast && (
          <DropdownMenuItem className="min-h-11" onSelect={player.requestGoogleCast}>
            <Cast />
            Google Cast
          </DropdownMenuItem>
        )}
        {downloadHref && (
          <DropdownMenuItem asChild className="min-h-11">
            <a href={downloadHref} download>
              <Download />
              Download
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Timeline({ player }: { player: ReturnType<typeof useVideoPlayer> }) {
  return (
    <div className="relative flex h-11 items-center">
      <div className="pointer-events-none absolute right-0 left-0 h-1 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full origin-left bg-white/50"
          style={{ width: `${player.bufferedPercent}%` }}
        />
      </div>
      <Slider
        aria-label="Video progress"
        min={player.seekMin}
        max={Math.max(player.seekMax, player.seekMin + 0.01)}
        step={0.1}
        value={[player.seekValue]}
        disabled={!player.media.canSeek}
        onValueChange={player.previewSeek}
        onValueCommit={player.commitSeek}
        onPointerDownCapture={player.startPointerSeek}
        onPointerMoveCapture={player.movePointerSeek}
        onPointerUpCapture={player.finishPointerSeek}
        onPointerCancelCapture={player.finishPointerSeek}
        className="relative z-10 h-11 cursor-pointer [&_[data-slot=slider-range]]:bg-white [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:bg-transparent"
      />
    </div>
  );
}

function PlayerControls({
  player,
  playbackRates,
  skipSeconds,
  downloadHref,
}: {
  player: ReturnType<typeof useVideoPlayer>;
  playbackRates: readonly number[];
  skipSeconds: number;
  downloadHref: string | null;
}) {
  const volumeLabel = player.media.muted ? "Unmute" : "Mute";
  const VolumeIcon = player.media.muted ? VolumeX : player.media.volume < 0.5 ? Volume1 : Volume2;

  return (
    <TooltipProvider>
      <Controls.Root className="pointer-events-none absolute inset-0 z-20 flex flex-col text-white opacity-0 transition-opacity duration-200 data-[visible]:opacity-100 motion-reduce:transition-none">
        <Controls.Group className="pointer-events-none flex min-h-11 items-center px-3 drop-shadow-sm in-data-[visible]:pointer-events-auto">
          <span className="truncate text-sm font-medium">{player.media.title}</span>
          <ChapterTitle className="text-muted-foreground ml-2 hidden truncate text-xs sm:block" />
        </Controls.Group>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Button
            type="button"
            size="icon"
            aria-label={player.media.ended ? "Replay" : player.media.paused ? "Play" : "Pause"}
            onClick={player.togglePlayback}
            className="pointer-events-none size-14 rounded-full border-white/30 bg-black/50 text-white hover:bg-black/70 hover:text-white in-data-[visible]:pointer-events-auto"
          >
            {player.media.ended ? (
              <RotateCcw className="size-6" />
            ) : player.media.paused ? (
              <Play className="size-6 fill-current" />
            ) : (
              <Pause className="size-6 fill-current" />
            )}
          </Button>
        </div>

        <Controls.Group className="pointer-events-none mt-auto px-2 pb-1 in-data-[visible]:pointer-events-auto sm:px-3">
          <Timeline player={player} />
          <div className="flex min-w-0 items-center">
            <PlayerButton
              label={player.media.ended ? "Replay" : player.media.paused ? "Play" : "Pause"}
              onClick={player.togglePlayback}
            >
              {player.media.ended ? (
                <RotateCcw />
              ) : player.media.paused ? (
                <Play className="fill-current" />
              ) : (
                <Pause className="fill-current" />
              )}
            </PlayerButton>

            <PlayerButton
              label={`Back ${skipSeconds} seconds`}
              onClick={(event) => player.seekBy(-skipSeconds, event)}
              className="hidden sm:inline-flex"
              disabled={!player.media.canSeek}
            >
              <Rewind />
            </PlayerButton>
            <PlayerButton
              label={`Forward ${skipSeconds} seconds`}
              onClick={(event) => player.seekBy(skipSeconds, event)}
              className="hidden sm:inline-flex"
              disabled={!player.media.canSeek}
            >
              <FastForward />
            </PlayerButton>

            <span className="hidden shrink-0 px-1 font-mono text-xs text-white tabular-nums drop-shadow-sm md:inline">
              {formatMediaTime(player.media.currentTime)} / {formatMediaTime(player.media.duration)}
            </span>

            <div className="hidden items-center sm:flex">
              <PlayerButton label={volumeLabel} onClick={player.toggleMuted}>
                <VolumeIcon />
              </PlayerButton>
              <Slider
                aria-label="Volume"
                min={0}
                max={100}
                step={1}
                value={[player.media.muted ? 0 : player.media.volume * 100]}
                disabled={!player.media.canSetVolume}
                onValueChange={player.changeVolume}
                className="w-20"
              />
            </div>

            <div className="flex-1" />

            {player.media.live && (
              <Button
                type="button"
                variant={player.media.liveEdge ? "secondary" : "ghost"}
                size="sm"
                onClick={player.seekToLiveEdge}
                className="mr-1 h-11 px-2"
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    player.media.liveEdge ? "bg-destructive" : "bg-muted-foreground",
                  )}
                />
                Live
              </Button>
            )}

            {player.media.hasCaptions && (
              <PlayerButton
                label={player.media.textTrack ? "Turn captions off" : "Turn captions on"}
                aria-pressed={Boolean(player.media.textTrack)}
                onClick={player.toggleCaptions}
                className={cn(
                  "hidden sm:inline-flex",
                  player.media.textTrack &&
                    "bg-white text-black hover:bg-white/90 hover:text-black",
                )}
              >
                <Captions />
              </PlayerButton>
            )}

            <SettingsMenu
              player={player}
              playbackRates={playbackRates}
              downloadHref={downloadHref}
            />

            {player.media.canPictureInPicture && (
              <PlayerButton
                label={
                  player.media.pictureInPicture ? "Exit picture in picture" : "Picture in picture"
                }
                onClick={player.togglePictureInPicture}
                className="hidden sm:inline-flex"
              >
                <PictureInPicture2 />
              </PlayerButton>
            )}

            {player.media.canFullscreen && (
              <PlayerButton
                label={player.media.fullscreen ? "Exit fullscreen" : "Fullscreen"}
                onClick={player.toggleFullscreen}
              >
                {player.media.fullscreen ? <Minimize /> : <Maximize />}
              </PlayerButton>
            )}
          </div>
        </Controls.Group>
      </Controls.Root>
    </TooltipProvider>
  );
}

export function VideoPlayer({
  src,
  title,
  tracks = [],
  playbackRates = DEFAULT_PLAYBACK_RATES,
  skipSeconds = 10,
  download = false,
  className,
  aspectRatio = "16/9",
  crossOrigin = true,
  load = "visible",
  posterLoad = "visible",
  playsInline = true,
  preload = "metadata",
  keyTarget = "player",
  keyShortcuts = {
    togglePaused: "k Space",
    toggleMuted: "m",
    toggleFullscreen: "f",
    togglePictureInPicture: "i",
    toggleCaptions: "c",
    seekBackward: "j J ArrowLeft",
    seekForward: "l L ArrowRight",
    volumeUp: "ArrowUp",
    volumeDown: "ArrowDown",
    speedUp: ">",
    slowDown: "<",
  },
  onProviderChange,
  ...playerProps
}: VideoPlayerProps) {
  const downloadHref = getDownloadHref(src, download);

  function handleProviderChange(
    provider: MediaProviderAdapter | null,
    nativeEvent: Parameters<NonNullable<MediaPlayerProps["onProviderChange"]>>[1],
  ): void {
    configureMediaProvider(provider);
    onProviderChange?.(provider, nativeEvent);
  }

  return (
    <MediaPlayer
      src={src}
      title={title}
      aspectRatio={aspectRatio}
      crossOrigin={crossOrigin}
      load={load}
      posterLoad={posterLoad}
      playsInline={playsInline}
      preload={preload}
      keyTarget={keyTarget}
      keyShortcuts={keyShortcuts}
      onProviderChange={handleProviderChange}
      className={cn(
        "group/video-player bg-foreground text-background focus-visible:ring-ring/50 relative isolate block w-full overflow-hidden rounded-lg border outline-none focus-visible:ring-3",
        className,
      )}
      {...playerProps}
    >
      <MediaProvider>
        {playerProps.poster && (
          <Poster
            src={playerProps.poster}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-200 data-[visible]:opacity-100 motion-reduce:transition-none"
          />
        )}
        {tracks.map((track) => (
          <Track key={track.id} {...track} />
        ))}
      </MediaProvider>

      <MediaAnnouncer />
      <CaptionsDisplay className="vds-captions" />
      <Gesture event="pointerup" action="toggle:paused" className="absolute inset-0 z-10" />
      <Gesture event="dblpointerup" action="toggle:fullscreen" className="absolute inset-0 z-10" />

      <PlayerStateOverlay />
      <PlayerControlsShell
        playbackRates={playbackRates}
        skipSeconds={skipSeconds}
        downloadHref={downloadHref}
      />
    </MediaPlayer>
  );
}

function PlayerStateOverlay() {
  const player = useVideoPlayer();

  if (player.media.error) {
    return (
      <div className="bg-background/90 text-foreground absolute inset-0 z-30 flex items-center justify-center p-6 text-center">
        <div className="space-y-2">
          <p className="font-medium">Unable to play this video</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {player.media.error.message || "Check the source URL, media format, and CORS headers."}
          </p>
        </div>
      </div>
    );
  }

  if (player.media.waiting) {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <LoaderCircle
          aria-label="Buffering"
          className="bg-background/80 text-foreground size-11 animate-spin rounded-full p-2 motion-reduce:animate-none"
        />
      </div>
    );
  }

  return null;
}

function PlayerControlsShell({
  playbackRates,
  skipSeconds,
  downloadHref,
}: {
  playbackRates: readonly number[];
  skipSeconds: number;
  downloadHref: string | null;
}) {
  const player = useVideoPlayer();

  return (
    <PlayerControls
      player={player}
      playbackRates={playbackRates}
      skipSeconds={skipSeconds}
      downloadHref={downloadHref}
    />
  );
}
