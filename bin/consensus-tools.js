#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

function nodeSupportsImportFlag() {
  const [major, minor] = process.versions.node.split('.').map((n) => Number(n));
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return true;
  // --import was added in Node 20.6.0 and 18.19.0.
  if (major > 20) return true;
  if (major === 20) return minor >= 6;
  if (major === 19) return true;
  if (major === 18) return minor >= 19;
  return false;
}

const tsxLoaderPath = require.resolve('tsx');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const entry = path.join(__dirname, '..', 'src', 'standalone.ts');

const loaderSpecifier = pathToFileURL(tsxLoaderPath).href;
const nodeArgs = nodeSupportsImportFlag() ? ['--import', loaderSpecifier] : ['--loader', loaderSpecifier];

const result = spawnSync(process.execPath, [...nodeArgs, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});

process.exit(result.status ?? 1);

