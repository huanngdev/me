import ts from "typescript";

export type ImportKind = "import" | "export" | "dynamic" | "side-effect" | "require-alias";

export type ImportRef = {
  /** Module specifier text, after unescaping. */
  specifier: string;
  /** Offset of the first character inside the quotes. */
  start: number;
  /** Offset just past the last character inside the quotes. */
  end: number;
  kind: ImportKind;
  typeOnly: boolean;
};

export type TextEdit = {
  start: number;
  end: number;
  replacement: string;
};

function scriptKindFor(fileName: string): ts.ScriptKind {
  return fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/**
 * Every module specifier in a file: static imports, `export ... from`,
 * `import x = require()`-free external module references, dynamic `import()`
 * with a literal argument, and side-effect imports (`import "./x.css"`).
 * Non-literal dynamic imports are rejected because the crawler cannot follow them.
 */
export function collectImports(fileName: string, text: string): ImportRef[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );
  const refs: ImportRef[] = [];

  const literalRef = (
    literal: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
    kind: ImportKind,
    typeOnly: boolean,
  ): ImportRef => {
    const start = literal.getStart(sourceFile) + 1;
    const end = literal.getEnd() - 1;
    const raw = text.slice(start, end);
    if (raw !== literal.text) {
      throw new Error(`${fileName}: escaped module specifier is not supported: ${raw}`);
    }
    return { specifier: literal.text, start, end, kind, typeOnly };
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause === undefined) {
        refs.push(literalRef(node.moduleSpecifier, "side-effect", false));
      } else {
        refs.push(literalRef(node.moduleSpecifier, "import", clause.isTypeOnly));
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) {
        throw new Error(`${fileName}: export specifier must be a string literal`);
      }
      refs.push(literalRef(node.moduleSpecifier, "export", node.isTypeOnly));
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      refs.push(literalRef(node.moduleReference.expression, "require-alias", node.isTypeOnly));
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (
        argument === undefined ||
        !(ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        throw new Error(
          `${fileName}:${position.line + 1}: dynamic import() needs a literal specifier`,
        );
      }
      refs.push(literalRef(argument, "dynamic", false));
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return refs;
}

/**
 * Applies non-overlapping edits by offset. Bytes outside the edited ranges are
 * copied unchanged, so a rewrite never reformats the file.
 */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start);
  let result = text;
  let previousStart = Number.POSITIVE_INFINITY;
  for (const edit of ordered) {
    if (edit.end > previousStart) {
      throw new Error("overlapping edits");
    }
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
    previousStart = edit.start;
  }
  return result;
}
