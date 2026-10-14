import { DOCS, docHref } from "@/lib/docs";
import { SITE } from "@/lib/site";

/**
 * `/llms.txt` — a plain-text map of the site for an agent that has no browser. Static: it is built
 * from the docs registry at build time and reads nothing at request time.
 */

function build(): string {
  const docLines = DOCS.map(
    (doc) =>
      `- [${doc.seoTitle ?? doc.title}](${SITE.url}${docHref(doc.slug)}): ${doc.description}`,
  );

  const lines: string[] = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.tagline}. Built on Plate (platejs 53) and distributed as a shadcn registry block.`,
    "",
    "## Site",
    "",
    `- Home: ${SITE.url}`,
    `- Docs: ${SITE.url}/docs`,
    `- Source: ${SITE.repoUrl}`,
    `- Editor source: ${SITE.editorSourceUrl}`,
    "",
    "## Docs",
    "",
    ...docLines,
    "",
    "## Install",
    "",
    `- Registry item: ${SITE.url}/r/notion-like-editor.json`,
    `- Command: npx shadcn@latest add ${SITE.url}/r/notion-like-editor.json`,
    "",
    "## Agent skill",
    "",
    "A skill for coding agents, covering installation, mounting, persistence, file uploads and",
    "customisation. It installs with the skills CLI:",
    "",
    "```bash",
    "npx skills@latest add huanngdev/me --skill richcn-editor",
    "```",
    "",
    `- Skill source: ${SITE.skillUrl}`,
    "",
  ];

  return lines.join("\n");
}

const BODY = build();

export const dynamic = "force-static";

export function GET() {
  return new Response(BODY, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
