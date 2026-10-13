import { BaseMentionInputPlugin } from "@platejs/mention";
import { toPlatePlugin } from "platejs/react";
import { PageLinkElement } from "../../../components/elements/page-link-element";
import { FootnoteDefElement } from "../../../components/elements/footnote-def-element";
import { FootnoteRefElement } from "../../../components/elements/footnote-ref-element";
import { InlineDateElement } from "../../../components/elements/inline-date-element";
import { InlineEquationElement } from "../../../components/elements/inline-equation-element";
import { inlineDatePlugin } from "../../features/editor-inline-date";
import { footnoteRefPlugin } from "../../features/editor-footnote";
import { footnoteDefPlugin } from "../editor-footnote";
import { onFootnoteDefKeyDown, onFootnoteRefKeyDown } from "../editor-footnote-ui";
import { inlineEquationPlugin } from "../../features/editor-inline-equation";
import { inlineDateUiPlugin, onInlineDateKeyDown } from "../editor-inline-date-ui";
import { inlineEquationUiPlugin, onInlineEquationKeyDown } from "../editor-inline-equation-ui";
import { onPageLinkKeyDown, pageLinkPlugin } from "../editor-page-link";
import { linkPlugin, onLinkKeyDown, setLinkComposing } from "../editor-link";
import { LinkElement } from "../../../components/elements/link-element";
import { mentionPlugin, onMentionKeyDown, setMentionComposing } from "../editor-mention";
import { MentionElement, MentionInputElement } from "../../../components/elements/mention-element";

export const linkPlatePlugin = toPlatePlugin(linkPlugin, {
  render: { node: LinkElement },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onLinkKeyDown(editor, event);
    },
    onCompositionStart: ({ editor }) => {
      setLinkComposing(editor, true);
    },
    onCompositionEnd: ({ editor }) => {
      setLinkComposing(editor, false);
    },
  },
});

export const inlineEquationPlatePlugin = toPlatePlugin(inlineEquationPlugin, {
  render: { node: InlineEquationElement },
});

// toPlatePlugin, not createSlatePlugin: a Slate plugin's handlers have no onKeyDown.
// Holds the popover state. Mod+Shift+E and Enter on the selected equation are handled here.

export const inlineEquationUiPlatePlugin = toPlatePlugin(inlineEquationUiPlugin, {
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onInlineEquationKeyDown(editor, event);
    },
  },
});

// Registered after the inline equation, so its setFragmentData override wraps the equation's.

export const inlineDatePlatePlugin = toPlatePlugin(inlineDatePlugin, {
  render: { node: InlineDateElement },
});

// Registered after the inline date, so its plain-text copy overrides the date's when a fragment has both.

export const footnoteRefPlatePlugin = toPlatePlugin(footnoteRefPlugin, {
  render: { node: FootnoteRefElement },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onFootnoteRefKeyDown(editor, event);
    },
  },
});

export const footnoteDefPlatePlugin = toPlatePlugin(footnoteDefPlugin, {
  render: { node: FootnoteDefElement },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onFootnoteDefKeyDown(editor, event);
    },
  },
});

// Mod+; inserts today's date, and Enter on a selected inline date opens it.

export const inlineDateUiPlatePlugin = toPlatePlugin(inlineDateUiPlugin, {
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onInlineDateKeyDown(editor, event);
    },
  },
});

// Registered after the inline date, so its plain-text copy overrides the date's when a fragment has both.

export const pageLinkPlatePlugin = toPlatePlugin(pageLinkPlugin, {
  render: { node: PageLinkElement },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onPageLinkKeyDown(editor, event);
    },
  },
});

export const mentionPlatePlugin = toPlatePlugin(mentionPlugin, {
  render: { node: MentionElement },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      onMentionKeyDown(editor, event);
    },
    onCompositionStart: ({ editor }) => {
      setMentionComposing(editor, true);
    },
    onCompositionEnd: ({ editor }) => {
      setMentionComposing(editor, false);
    },
  },
}).configurePlugin(BaseMentionInputPlugin, {
  render: { node: MentionInputElement },
});
