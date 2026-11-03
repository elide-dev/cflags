# Elide's C Flags

Tree of simple text files which compound into final clang and LLD flags when building Elide. On Unix-like platforms, Elide and related repos may consult this one to build with a uniform suite of flags across compilation units.

Flag files allow comments which start with `#`. Comments are thus inline explaining the purpose of most flags.

There are two classes of profile:

- **Compile profiles** (`base`, `linux`, `darwin`, `linux-amd64`, …) apply to *every* translation unit and link stage in the dependency-build pipeline (bundled libraries, configure probes, …). Anything here must be safe at intermediate link stages.
- **Binary profiles** (`*-bin`) apply only at the consuming project's *final* executable / shared-library / dylib link. They hold flags — section stripping, undefined-symbol rejection, debug compression, fatal warnings — that would break a dependency's intermediate conftest or test-binary link if applied earlier. The chain mirrors the compile side: an OS-level `linux-bin` / `darwin-bin` carries the OS-wide final-link flags, and a leaf `*-arch-bin` layers any arch-specific final-link flags on top. The full rollup for `linux-amd64-bin` is `base → linux → linux-amd64 → linux-bin → linux-amd64-bin`.

## Toolchain & deployment floor

These flags assume the following floor; downstream consumers should match
or override per-profile.

| Layer                       | Floor                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| Compiler                    | mainline LLVM **clang 23.1.4**, on every platform          |
| Linker                      | **lld 23.1.4** (`ld.lld` on Linux, `ld64.lld` on Darwin)                        |
| Linux libc                  | **musl 1.2.4+** primary; **glibc 2.36+** for any glibc consumers          |
| Linux libc++                | Vendored libc++ (Linux/amd64); `_LIBCPP_HARDENING_MODE` honored          |
| macOS                       | macOS 12+ (dyld 4 / chained-fixups format)                               |
| Linux/amd64 ISA             | `x86-64-v3` (Haswell / Zen 1+); crypto libraries use runtime dispatch |
| Darwin/amd64 ISA            | `x86-64-v3` + `aes`/`pclmul`/`rdrand` → Haswell+ (2013); verify CPU support independently of macOS version |
| Linux/arm64 ISA             | `armv8.2-a` + `crypto`/`crc`/`dotprod` → Graviton 2+, Neoverse N1+, Altra |
| Darwin/arm64 ISA            | `apple-m1` (ARMv8.5-A) — every shipping Apple Silicon Mac                |

## LLVM 23.1.4 review

Keep ThinLTO, `-O3`, unwind information, the current ISA flags, and the
compile/final-link profile split. The LLVM upgrade alone does not justify
raising the deployment CPU floor or enabling experimental optimizations.

The shared baseline enables strong stack canaries without disabling optimization.
Linux x86-64 targets `x86-64-v3` without extra ISA switches; optional crypto/GFNI/RNG
flags cannot be undone by appending `-march`. Libraries can retain runtime CPU dispatch.

The shared baseline now uses `-fPIC` alone. A trailing `-fPIE` overrides it
and can make archive members fail to link into shared libraries. Consumers
must select `-pie` for PIE executables or `-shared` / `-dynamiclib` for libraries;
`--bin` supports both output kinds and cannot select one automatically.

Relative C++ vtables and aggressive constant merging are now opt-in in
`labs.disabled.txt`. Rebuild all downstream archives when adopting this
change, especially C++ objects: mixing old relative-vtable objects with the
normal C++ ABI is unsafe. `-Wstrict-overflow` was removed because it is a
[Clang compatibility no-op](https://releases.llvm.org/23.1.0/tools/clang/docs/DiagnosticsReference.html#wstrict-overflow).
ELF linker optimization uses the documented `-O2` tier; compiler `-O3` and
ThinLTO optimization are separate settings.

Next experiments should measure toolchain startup and representative downstream
workloads (including bundled SQLite): test the parked interposition/PLT flags
independently after fixing PIC and auditing symbol replacement requirements;
compare `-O2`/`-O3` and profile-guided optimization; evaluate additional libc++ hardening separately. Polly remains build-dependent. Do not infer
that a shared LLVM version supplies Polly or makes experimental ABIs safe.
The current smoke matrix does not validate musl/static PIE, the oldest
supported CPUs, or downstream application performance.

References: [Clang 23 release notes](https://releases.llvm.org/23.1.0/tools/clang/docs/ReleaseNotes.html),
[LLD 23 release notes](https://releases.llvm.org/23.1.0/tools/lld/docs/ReleaseNotes.html),
[LLD 23.1.4 options](https://github.com/llvm/llvm-project/blob/llvmorg-23.1.4/lld/docs/ld.lld.1),
and [musl 1.2.4 RELR support](https://www.openwall.com/lists/musl/2023/05/02/1).

## Features

Compiler features activated or facilitated by these flags:

| Feature                       | Platforms     | Description                                                       |
| ----------------------------- | ------------- | ----------------------------------------------------------------- |
| [Thin LTO][9]                 | All           | Emits and optimizes as LLVM bitcode, program-wide                 |
| Function/Data Sections        | All           | `-f{data,function}-sections` (collected at *final* link, see below) |
| Stack Hardening               | Linux         | `-fstack-protector-strong` on all platforms, plus Linux `-fstack-clash-protection` |
| Async Unwind Tables           | All           | `-fasynchronous-unwind-tables` for profilers + crash collectors   |
| [LLD][10] as linker           | All           | `-fuse-ld=lld` required for Thin LTO                              |
| Full RELRO       | Linux         | `-z relro -z now` for eager binding and read-only relocation tables                     |
| DT_RELR relative relocations  | Linux         | `-z pack-relative-relocs` shrinks PIE relocation tables           |
| LLD ICF (safe)                | Linux         | `--icf=safe` folds identical address-not-taken functions          |
| GNU-hash dyn-symbol table     | Linux         | `--hash-style=gnu` (smaller, ~2× faster lookup at load)           |
| LLD link optimization         | Linux         | `-Wl,-O2` string tail merging and branch-to-branch optimization          |
| Microarch tuning              | Linux amd64   | `-mtune=znver3` (mirrors Rust `-Ztune-cpu=znver3`)                |
| PAC + BTI                     | arm64 (both)  | `-mbranch-protection=standard`; runtime enforcement depends on platform and inputs           |
| Mach-O fixup chains           | Darwin        | `-bind_at_load`, `-fixup_chains`, `-no_data_in_code_info`         |

### Phasing in

Some flags are disabled pending ABI, toolchain, or performance validation. They are tracked verbatim in
[`labs.disabled.txt`][19] with a re-enable plan per flag. Currently
parked, with the exact spelling needed when cut-and-pasting back into
the live profile:

- `-fmerge-all-constants` (object-identity semantics)
- `-fexperimental-relative-c++-abi-vtables` (requires a coordinated C++ ABI)
- `-fno-semantic-interposition` and `-fno-plt` (audit interposition needs and benchmark independently)
- `-mllvm -polly` (requires a Polly-enabled build and measured benefit)
- `-fbasic-block-sections=all` (requires a profile-driven layout pipeline)
- `-fzero-call-used-regs=used-gpr`
- `-fcf-protection=full`
- `-U_FORTIFY_SOURCE`
- `-D_FORTIFY_SOURCE=2`
- `-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_FAST`

The file is **not** consumed by the rollup or by `cli/cflags.{sh,ts}`
— it is a parking lot, not a profile.

> [!IMPORTANT]
> **Section-stripping and similar "no further link" flags live in `*-bin`,
> not in the per-OS or per-arch compile profiles.** The compile profiles
> are applied to dependency builds (bundled third-party libraries, configure
> probes, …) where intermediate links still reference symbols that
> `-Wl,--gc-sections` / `-Wl,-dead_strip` would otherwise drop. The
> compiler still emits per-function/data sections via
> `-ffunction-sections` / `-fdata-sections`, so the consuming project
> picks up the full DCE win by selecting the corresponding `*-bin`
> profile (e.g. `linux-amd64-bin`) at its **own** final link step.

> [!NOTE]
> Enable `-Wconversion` selectively for owned targets after auditing diagnostics.
> Bundled third-party libraries may need a different warning policy.

## Flag Profiles

### Compile profiles

Applied to every translation unit and every link in the dependency-build pipeline. Roll-up: e.g. `linux-amd64` = `base.txt` + `linux.txt` + `linux-amd64.txt`.

| Profile | OS | Arch | Description |
| --------- | ---- | ---- | -------- |
| [base][0] | (All) | (All) | Baseline flags. |
| [linux][1] | Linux | (All) | Linux-only flags. |
| [linux-amd64][2] | Linux | amd64 | Linux x86-64 flags. |
| [linux-arm64][3] | Linux | aarch64 | Linux ARM64 flags. |
| [darwin][4] | macOS | (All) | macOS-only flags. |
| [darwin-amd64][5] | Darwin | amd64 | macOS Intel flags. |
| [darwin-arm64][6] | Darwin | aarch64 | macOS M-series flags. |

### Binary profiles

Applied **only** at the consuming project's final executable / shared-library / dylib link step. Holds flags that would break intermediate dependency-build links (configure probes, dependency test binaries, …). Roll-up: a `*-bin` profile inherits its compile-profile chain first, then adds the OS-wide `*-bin` layer, then the per-arch `*-arch-bin` layer. The full rollup for `linux-amd64-bin` is `base → linux → linux-amd64 → linux-bin → linux-amd64-bin`.

| Profile | OS | Arch | Adds                                                                              |
| ------- | ---- | ---- | --------------------------------------------------------------------------------- |
| [linux-bin][15]        | Linux  | (All)    | `--gc-sections`, `-z defs`, `--compress-debug-sections=zstd`, `--fatal-warnings` |
| [linux-amd64-bin][11]  | Linux  | amd64    | (placeholder for x86_64-only leaf-link flags)                                     |
| [linux-arm64-bin][12]  | Linux  | aarch64  | (placeholder for aarch64-only leaf-link flags)                                    |
| [darwin-bin][16]       | Darwin | (All)    | `-dead_strip`, `-dead_strip_dylibs`                                               |
| [darwin-amd64-bin][13] | Darwin | amd64    | (placeholder for Intel-Mac-only leaf-link flags)                                  |
| [darwin-arm64-bin][14] | Darwin | aarch64  | (placeholder for Apple-Silicon-only leaf-link flags)                              |

> [!NOTE]
> Windows is not covered here because we do not (yet) compile with `clang` on Windows.

## CLI

Two equivalent scripts in [`cli/`](./cli) emit the resolved, comment-stripped flag list as a single whitespace-separated line, suitable for use directly with shell command substitution.

| Script                      | Runtime |
| --------------------------- | ------- |
| [`cli/cflags.sh`][17]       | Bash    |
| [`cli/cflags.ts`][18]       | Bun     |

Both share the same surface:

```
cflags[.sh|.ts] [<os> <arch>] [--bin]
```

- `<os>` ∈ `linux | darwin` — defaults to the host
- `<arch>` ∈ `amd64 | arm64` — defaults to the host
- `--bin` — switch from the compile rollup (`base → os → os-arch`) to the binary rollup (`base → os → os-arch → os-bin → os-arch-bin`)

Examples:

```sh
# host compile flags
export CFLAGS="$(./cli/cflags.sh)"

# host final-link flags
export LDFLAGS="$(./cli/cflags.sh --bin)"

# explicit cross-target
export CFLAGS="$(bun run ./cli/cflags.ts linux arm64)"
export LDFLAGS="$(bun run ./cli/cflags.ts linux arm64 --bin)"
```

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and PR using checksum-pinned LLVM 23.1.4 release archives; it verifies both compiler and linker versions, resolves the flag set with both `cli/cflags.sh` and `cli/cflags.ts`, asserts they emit byte-identical output, and then compiles + links the [`tests/probe.c`](./tests/probe.c) translation unit against the full compile and binary profiles for the targets below. It also runs a C++ runtime virtual-call probe and links separately compiled objects into a shared library. The matrix covers:

| Target | GitHub runner |
| ------ | ------------- |
| `linux-amd64`  | `ubuntu-24.04` |
| `linux-arm64`  | `ubuntu-24.04-arm` |
| `darwin-arm64` | `macos-14` |

(`darwin-amd64` is not covered: GitHub no longer offers an Intel-Mac runner. The profile is exercised locally before tagged releases.)

## Downstream Projects

These profiles are consumed by Elide's own toolchain and downstream projects,
including bundled third-party libraries such as SQLite. Netty and TCNative
no longer consume them; their former JNI build define has been removed.

[0]: ./base.txt
[1]: ./linux.txt
[2]: ./linux-amd64.txt
[3]: ./linux-arm64.txt
[4]: ./darwin.txt
[5]: ./darwin-amd64.txt
[6]: ./darwin-arm64.txt
[9]: https://clang.llvm.org/docs/ThinLTO.html
[10]: https://lld.llvm.org/
[11]: ./linux-amd64-bin.txt
[12]: ./linux-arm64-bin.txt
[13]: ./darwin-amd64-bin.txt
[14]: ./darwin-arm64-bin.txt
[15]: ./linux-bin.txt
[16]: ./darwin-bin.txt
[17]: ./cli/cflags.sh
[18]: ./cli/cflags.ts
[19]: ./labs.disabled.txt
