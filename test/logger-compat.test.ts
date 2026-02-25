import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(p));
    else if (entry.isFile() && (p.endsWith('.ts') || p.endsWith('.tsx'))) out.push(p);
  }
  return out;
}

test('logger calls keep message-first/string-first signature for OpenClaw console compatibility', () => {
  const files = [path.join(ROOT, 'index.ts'), ...listTsFiles(path.join(ROOT, 'src'))].filter((p) => fs.existsSync(p));

  // Matches calls like logger?.warn?.({ err }, 'msg') or this.logger?.info?.({x}, 'msg').
  const objectFirstLoggerCall = /\b(?:this\.)?logger\?\.\s*(?:debug|info|warn|error|trace)\?\.\s*\(\s*\{/m;

  const offenders: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (objectFirstLoggerCall.test(content)) offenders.push(path.relative(ROOT, file));
  }

  assert.equal(
    offenders.length,
    0,
    `Found object-first logger calls (incompatible with newer OpenClaw formatter): ${offenders.join(', ')}`
  );
});
