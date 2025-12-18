// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: fileName => fileName,
    getNewLine: () => '\n',
  });
}

describe('TypeScript config', () => {
  it('typechecks TSX + React with strict settings', () => {
    const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
    const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (error) {
      throw new Error(formatDiagnostics([error]));
    }

    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, process.cwd());
    const fixturePath = path.join(process.cwd(), 'tests/fixtures/tsx/Smoke.tsx');
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Missing fixture: ${fixturePath}`);
    }

    const options: ts.CompilerOptions = {
      ...parsed.options,
      noEmit: true,
      // The project config sets `rootDir: ./src`; for this isolated test fixture, widen it so the
      // fixture path itself doesn't create unrelated diagnostics.
      rootDir: process.cwd(),
      outDir: undefined,
    };

    const program = ts.createProgram({
      rootNames: [fixturePath],
      options,
    });

    const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => d.category === ts.DiagnosticCategory.Error);
    if (diagnostics.length > 0) {
      throw new Error(formatDiagnostics(diagnostics));
    }
    expect(diagnostics).toEqual([]);
  });
});
