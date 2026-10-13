import { ImageOff } from "lucide-react";

import { IMAGE_ROW_CLASS } from "../elements/image-classes";

// Shown when a stored image cannot be loaded. Used by the editor element and the static renderer.
export function ImageUnavailableRow({ name }: { name: string | undefined }) {
  return (
    <div className={IMAGE_ROW_CLASS}>
      <ImageOff aria-hidden="true" className="size-4 shrink-0" />
      <span className="shrink-0">Image unavailable</span>
      {name === undefined ? null : <span className="min-w-0 truncate">{name}</span>}
    </div>
  );
}
