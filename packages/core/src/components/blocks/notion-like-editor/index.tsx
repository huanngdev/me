// The public entry point. It re-exports only what a host needs. It has no
// "use client" directive: the block is a client component in its own file, and
// the static renderer has no hooks, so both can be imported from a server component.
export { NotionLikeEditorBlock, type NotionLikeEditorBlockProps } from "./notion-like-editor-block";
export {
  NotionLikeEditorStatic,
  type NotionLikeEditorStaticProps,
} from "./notion-like-editor-static";
export { EMPTY_EDITOR_VALUE, type EditorValue } from "./lib/document/editor-value";
export {
  DEFAULT_EDITOR_OPTIONS,
  type EditorOptions,
  type ResolvedEditorOptions,
} from "./lib/features/editor-options";
export { DEFAULT_PLACEHOLDER } from "./lib/features/editor-placeholder";
export { createLocalStorageAdapter } from "./lib/document/local-storage-adapter";
export type { EditorPersistenceAdapter } from "./lib/document/editor-persistence";
export type { LinkPreviewAdapter } from "./lib/features/editor-bookmark-url";
export type {
  FileUploadAdapter,
  FileUploadOptions,
  UploadedFile,
} from "./lib/features/editor-file-upload";
export type { MentionEntity, MentionProvider } from "./lib/features/editor-mention-node";
export type {
  PageEntity,
  PageOpenRequest,
  PageProvider,
  PageResolution,
} from "./lib/features/editor-page-link";
