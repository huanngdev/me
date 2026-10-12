import type { ResolvedFileUrl } from "./file-upload-scope";

// What a media block with a stored url shows. Empty has no url. Loading waits for the url to resolve.
export type MediaState = "empty" | "loading" | "ready" | "unavailable";

// `src` is the loadable url once resolved. `failedUrl` is the url whose load failed, such as a video
// the browser cannot play. An unresolved url is loading, and a failed one is unavailable.
export function mediaResolveState(
  url: string | undefined,
  status: ResolvedFileUrl["status"],
  src: string | undefined,
  failedUrl: string | undefined,
): MediaState {
  if (url === undefined) {
    return "empty";
  }
  if (status === "unavailable") {
    return "unavailable";
  }
  if (src === undefined) {
    return "loading";
  }
  return src === failedUrl ? "unavailable" : "ready";
}
