import { CodeBlock } from "@repo/core/components/code-block";

import { readEditorFile, readSample } from "@/lib/docs-samples";

type SampleSource = {
  /** A file name under `src/docs-samples`, for example `editor-minimal.tsx`. */
  sample: string;
  editorFile?: never;
};

type EditorSource = {
  /** A path under the editor's own source, for a type block quoted from it. */
  editorFile: string;
  sample?: never;
};

export type DocCodeProps = (SampleSource | EditorSource) & { language?: string };

/**
 * Renders one type-checked sample, or one file from the editor's source, as code. The monorepo
 * import path is shown as the path a user gets after `shadcn add`, and long code is never
 * collapsed.
 */
export function DocCode({ sample, editorFile, language = "tsx" }: DocCodeProps) {
  const code = sample !== undefined ? readSample(sample) : readEditorFile(editorFile);
  return <CodeBlock code={code} language={language} maxLines={60} />;
}
