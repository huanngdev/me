import type { ReactNode } from "react";

import { IMAGE_ROW_CLASS } from "../elements/image-classes";

// Shown when a stored video or audio file cannot be loaded. It takes the icon and label of its kind.
export function MediaUnavailableRow({
  icon,
  label,
  name,
}: {
  icon: ReactNode;
  label: string;
  name: string | undefined;
}) {
  return (
    <div className={IMAGE_ROW_CLASS}>
      {icon}
      <span className="shrink-0">{label}</span>
      {name === undefined ? null : <span className="min-w-0 truncate">{name}</span>}
    </div>
  );
}
