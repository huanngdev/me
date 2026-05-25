import { codeToHtml, type BundledLanguage } from "shiki";

import { CodeBlockShell } from "./code-block-shell";

const SUPPORTED: ReadonlySet<string> = new Set([
  "tsx",
  "ts",
  "jsx",
  "js",
  "json",
  "bash",
  "html",
  "css",
  "python",
  "rust",
  "go",
  "text",
]);

export type CodeBlockProps = {
  code: string;
  language?: string;
  maxLines?: number;
  showLanguage?: boolean;
  className?: string;
};

export async function CodeBlock({
  code,
  language,
  maxLines = 12,
  showLanguage = true,
  className,
}: CodeBlockProps) {
  const detected = language ?? detectLanguage(code);
  const lang = SUPPORTED.has(detected) ? detected : "text";
  const lineCount = code.split("\n").length;

  const html = await codeToHtml(code, {
    lang: lang as BundledLanguage,
    themes: { light: "github-light-default", dark: "github-dark-default" },
    defaultColor: false,
  });

  return (
    <CodeBlockShell
      code={code}
      language={detected}
      html={html}
      lineCount={lineCount}
      maxLines={maxLines}
      showLanguage={showLanguage}
      className={className}
    />
  );
}

function detectLanguage(code: string): string {
  const sample = code.slice(0, 800);

  if (/^#!\s*\/(?:usr\/bin\/env\s+)?(?:bash|sh|zsh)/m.test(sample)) return "bash";
  if (/^\s*(?:\$\s|npm |bun |pnpm |yarn |git |curl )/m.test(sample)) return "bash";

  if (
    /^\s*<[a-zA-Z][^>]*>/m.test(sample) &&
    /<\/[a-zA-Z]+>/m.test(sample) &&
    !/=>|const |let |function /.test(sample)
  ) {
    return "html";
  }

  if (/^\s*[{[]/.test(sample.trim()) && /"[^"]+"\s*:/.test(sample)) return "json";

  const hasTypeAnnotations =
    /:\s*(?:string|number|boolean|[A-Z][A-Za-z0-9_]*(?:<|\[|\s*[=,)]))/.test(sample);
  const hasJsx = /<[A-Z][A-Za-z0-9]*[\s/>]|<\/[A-Za-z]/.test(sample);
  const hasJsLike = /\b(?:import|export|const|let|function|=>)\b/.test(sample);

  if (hasJsLike && hasJsx && hasTypeAnnotations) return "tsx";
  if (hasJsLike && hasJsx) return "jsx";
  if (hasJsLike && hasTypeAnnotations) return "ts";
  if (hasJsLike) return "js";

  if (/^\s*(?:def |class |from \S+ import|import \S+$)/m.test(sample)) return "python";
  if (/^\s*(?:fn |let mut |impl |use \S+::)/m.test(sample)) return "rust";
  if (/^\s*(?:package |func |type \w+ struct)/m.test(sample)) return "go";

  if (/^\s*[.#]?[\w-]+\s*\{[^}]*:[^}]+;/m.test(sample)) return "css";

  return "text";
}
