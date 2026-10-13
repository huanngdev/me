import { SITE } from "@/lib/site";

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-[700px] px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Docs</h1>
      <div className="text-foreground/80 mt-6 space-y-4 text-base leading-relaxed">
        <p>
          This is a block editor for React, built on Plate and shadcn primitives. It lives in the
          shared <code className="font-mono text-sm">@repo/core</code> package and is shown in
          richcn on its own.
        </p>
        <p>
          A document is JSON, checked against an allow list of block types, attributes and marks
          before it is opened or saved. The editor has no AI, no live collaboration and no import or
          export.
        </p>
        <p>
          The full feature list, usage notes and the persistence adapter API are in the README next
          to the source.
        </p>
        <p>
          <a
            href={SITE.editorSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-4 hover:no-underline"
          >
            Read the editor README on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
