#!/usr/bin/env bun
// Print the concatenated, comment-stripped clang/lld flag set for a given
// (os, arch) pair, optionally including the *-bin final-link layer.
//
// Usage:
//   bun run ./cli/cflags.ts                       # host os, host arch, compile profile
//   bun run ./cli/cflags.ts <os> <arch>           # explicit (os, arch), compile profile
//   bun run ./cli/cflags.ts <os> <arch> --bin     # explicit (os, arch), binary profile
//   bun run ./cli/cflags.ts --bin                 # host os, host arch, binary profile
//
// Output is whitespace-separated on a single line, suitable for:
//   export CFLAGS="$(bun run ./cli/cflags.ts)"
//   export LDFLAGS="$(bun run ./cli/cflags.ts --bin)"
//
// Recognized values:
//   <os>:   linux | darwin
//   <arch>: amd64 | arm64

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SUPPORTED_OS = ["linux", "darwin"] as const;
const SUPPORTED_ARCH = ["amd64", "arm64"] as const;
type Os = (typeof SUPPORTED_OS)[number];
type Arch = (typeof SUPPORTED_ARCH)[number];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");

function die(msg: string, code = 2): never {
  process.stderr.write(`cflags: ${msg}\n`);
  process.exit(code);
}

function usage(): never {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8")
    .split("\n")
    .slice(1)
    .map((l) => l.replace(/^\/\/ ?/, ""))
    .join("\n")
    .split(/\n\s*\n/)[0];
  process.stderr.write(text + "\n");
  process.exit(0);
}

function hostOs(): Os {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "darwin":
      return "darwin";
    default:
      die(`unsupported host os: ${process.platform}`);
  }
}

function hostArch(): Arch {
  switch (process.arch) {
    case "x64":
      return "amd64";
    case "arm64":
      return "arm64";
    default:
      die(`unsupported host arch: ${process.arch}`);
  }
}

const args = process.argv.slice(2);
let bin = false;
const positional: string[] = [];
for (const a of args) {
  if (a === "--bin") bin = true;
  else if (a === "-h" || a === "--help") usage();
  else if (a === "--") continue;
  else if (a.startsWith("-")) die(`unknown option: ${a}`);
  else positional.push(a);
}

if (positional.length > 2) {
  die("too many positional arguments (expected at most 2: <os> <arch>)");
}

const os = (positional[0] ?? hostOs()) as Os;
const arch = (positional[1] ?? hostArch()) as Arch;

if (!SUPPORTED_OS.includes(os)) {
  die(`unsupported os: ${os} (expected: ${SUPPORTED_OS.join(" | ")})`);
}
if (!SUPPORTED_ARCH.includes(arch)) {
  die(`unsupported arch: ${arch} (expected: ${SUPPORTED_ARCH.join(" | ")})`);
}

const files = [
  `${root}/base.txt`,
  `${root}/${os}.txt`,
  `${root}/${os}-${arch}.txt`,
];
if (bin) {
  files.push(`${root}/${os}-bin.txt`, `${root}/${os}-${arch}-bin.txt`);
}

const flags: string[] = [];
for (const f of files) {
  if (!existsSync(f)) die(`missing profile file: ${f}`, 1);
  for (const rawLine of readFileSync(f, "utf8").split("\n")) {
    // Strip end-of-line comments + surrounding whitespace.
    const stripped = rawLine.replace(/#.*$/, "").trim();
    if (stripped) flags.push(stripped);
  }
}

process.stdout.write(flags.join(" ") + "\n");
