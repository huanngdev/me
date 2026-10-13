import { nanoid } from "platejs";

import { embedElement, embedFieldsOf } from "../features/editor-embed";
import { parseEmbedUrl } from "../features/editor-embed-url";
import { pasteUrlActions, replacePastedUrlWith, type PasteUrlAction } from "./editor-paste-url";

// A pasted YouTube or Vimeo link becomes an embed. It is registered by createEditorPlugins, not at
// import time: package.json marks the package side-effect free, so a bundler drops a module that is
// only imported for its top-level code. The action is pushed once, so the bookmark stays first.
// It lives apart from editor-embed-commands.ts: the paste module imports the media blocks, which
// import the embed commands, so registering there would make an import cycle.
const EMBED_PASTE_URL_ACTION: PasteUrlAction = {
  id: "embed",
  label: "Embed",
  match: (url) => parseEmbedUrl(url) !== undefined,
  run: (editor, offer) => {
    const parsed = parseEmbedUrl(offer.url);
    if (parsed === undefined) {
      return;
    }

    replacePastedUrlWith(editor, offer, embedElement(embedFieldsOf(parsed), nanoid()));
  },
};

export function registerEmbedPasteAction(): void {
  if (pasteUrlActions.some((action) => action.id === EMBED_PASTE_URL_ACTION.id)) {
    return;
  }

  pasteUrlActions.push(EMBED_PASTE_URL_ACTION);
}
