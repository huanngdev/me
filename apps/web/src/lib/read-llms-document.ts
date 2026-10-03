import { readFileSync } from "node:fs";
import path from "node:path";

export type LlmsDocumentKind = "components" | "blocks";

const REPO_ROOT: string = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

export function readLlmsDocument(kind: LlmsDocumentKind, slug: string): string {
  return readFileSync(path.join(REPO_ROOT, "apps/web/public/llms", kind, `${slug}.txt`), "utf8");
}
