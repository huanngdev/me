import type { CSSProperties } from "react";

// One shell for the header row and the editor page, so their content edges line
// up. The large side padding on lg leaves room for the editor's block handle,
// which sits about 70 px left of the text and needs 8 px of space in the viewport.
export const CONTENT_SHELL_CLASS = "mx-auto w-full max-w-5xl px-4 lg:px-20";

// The editor column fills the shell, so its width equals the header content width.
export const EDITOR_WIDTH_STYLE = { "--editor-max-width": "100%" } as CSSProperties;
