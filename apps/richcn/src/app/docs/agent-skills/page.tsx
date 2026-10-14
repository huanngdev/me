import Link from "next/link";

import { CliCommand } from "@repo/core/components/cli-command/cli-command";
import { CodeBlock } from "@repo/core/components/code-block";

import { DocHeading } from "@/components/docs/doc-heading";
import { DocNote } from "@/components/docs/doc-note";
import { DocPage } from "@/components/docs/doc-page";
import { docHref, docMetadata } from "@/lib/docs";

export const metadata = docMetadata("agent-skills");

const MANUAL_INSTALL = `cp -R skills/richcn-editor .claude/skills/

# or, for the shared agent directory
cp -R skills/richcn-editor .agents/skills/`;

const LOCAL_INSTALL = `npx skills@latest add /path/to/me --skill richcn-editor`;

const EXAMPLE_PROMPT = `Add the notion-like editor to this project and save documents to our API.

- Install the shadcn registry block and answer N at the overwrite prompts.
- Mount it in a client component at app/notes/page.tsx with a documentId of "notes".
- Implement the persistence adapter against our PUT /api/documents/:id route. Store the
  revision the editor sends and return 409 when it is stale.
- Store uploaded images in our S3 bucket.
- Read the installed index.tsx before using any prop you are unsure about.`;

export default function AgentSkillsPage() {
  return (
    <DocPage slug="agent-skills">
      <section className="space-y-3">
        <p>
          An Agent Skill that teaches a coding agent to install, mount, persist and customise this
          editor. It lives in this repository at{" "}
          <code className="font-mono text-sm">skills/richcn-editor/</code>: one{" "}
          <code className="font-mono text-sm">SKILL.md</code> with the decision flow, the hard rules
          and short recipes, plus six reference files one level deep. The{" "}
          <a className="link-underline" href="https://skills.sh/" target="_blank" rel="noreferrer">
            skills CLI
          </a>{" "}
          reads the repository and installs it.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="covers">What the skill covers</DocHeading>
        <dl className="space-y-3">
          <div>
            <dt className="font-mono text-sm font-medium">installation.md</dt>
            <dd className="text-foreground/80">
              The add command and the namespace form, what is installed, the overwrite prompt, the
              Radix-only rule and the check after install.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-sm font-medium">usage.md</dt>
            <dd className="text-foreground/80">
              Memory and persisted modes, <code className="font-mono text-sm">documentId</code>,{" "}
              <code className="font-mono text-sm">initialValue</code> and{" "}
              <code className="font-mono text-sm">onChange</code>,{" "}
              <code className="font-mono text-sm">readOnly</code>, the server-side renderer, and
              which file needs <code className="font-mono text-sm">&quot;use client&quot;</code>.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-sm font-medium">persistence.md</dt>
            <dd className="text-foreground/80">
              The adapter interface, a complete adapter for an own API, the local storage adapter,
              and the autosave debounce.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-sm font-medium">file-uploads.md</dt>
            <dd className="text-foreground/80">
              The upload contract, a complete handler with progress and cancellation, URL
              resolution, and bookmark previews.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-sm font-medium">customization.md</dt>
            <dd className="text-foreground/80">
              Feature switches, options, theming, mentions and page links.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-sm font-medium">troubleshooting.md</dt>
            <dd className="text-foreground/80">
              The install and runtime failure modes: Base UI, an overwrite answered yes, the Vite
              alias, missing CSS, hydration, and a document that will not open.
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <DocHeading id="install">Install with the skills CLI</DocHeading>
        <p>
          The <code className="font-mono text-sm">skills</code> CLI reads the repository and
          installs the skill into the agent directories your project uses.
        </p>
        <CliCommand execute="skills add huanngdev/me --skill richcn-editor" />
        <p>
          The same command works against a local checkout, which is useful before the skill is on
          the repository&apos;s default branch:
        </p>
        <CodeBlock code={LOCAL_INSTALL} language="bash" />
        <DocNote>
          The CLI clones the default branch, so{" "}
          <code className="font-mono text-sm">skills add huanngdev/me --list</code> lists the skill
          once it is on <code className="font-mono text-sm">main</code>. Until then, list it from a
          local path: <code className="font-mono text-sm">npx skills add /path/to/me --list</code>.
        </DocNote>
      </section>

      <section className="space-y-3">
        <DocHeading id="manual">Install by hand</DocHeading>
        <p>
          A skill is a folder with a <code className="font-mono text-sm">SKILL.md</code> in it. Copy
          the folder into the agent directory the project uses, and the agent finds it without any
          other setup.
        </p>
        <CodeBlock code={MANUAL_INSTALL} language="bash" />
        <p>
          The reference files are relative links from{" "}
          <code className="font-mono text-sm">SKILL.md</code>, so copy the whole folder and not just
          the file.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="example">An example prompt</DocHeading>
        <p>
          The skill is written for an agent that is already in the project. A prompt that names the
          work, the API and the storage backend is enough; the skill supplies the rest.
        </p>
        <CodeBlock code={EXAMPLE_PROMPT} language="text" />
        <p>
          The skill&apos;s hard rules are what keep an agent honest here: read the installed{" "}
          <code className="font-mono text-sm">index.tsx</code> before using a prop, never edit{" "}
          <code className="font-mono text-sm">components/ui/*</code>, answer{" "}
          <code className="font-mono text-sm">N</code> at the overwrite prompt, and keep the editor
          behind a client boundary.
        </p>
      </section>

      <section className="space-y-3">
        <DocHeading id="next">Related</DocHeading>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <Link className="link-underline" href={docHref("installation")}>
              Installation
            </Link>{" "}
            for the commands the skill runs
          </li>
          <li>
            <Link className="link-underline" href={docHref("known-limits")}>
              Known limits
            </Link>{" "}
            for what the skill will tell an agent not to promise
          </li>
        </ul>
      </section>
    </DocPage>
  );
}
