# Elide's C Flags

Tree of simple text files which compound into final clang and LLD flags when building Elide. On Unix-like platforms, Elide and related repos may consult this one to build with a uniform suite of flags across compilation units.

Flag files allow comments which start with `#`. Comments are thus inline explaining the purpose of most flags.

There are two classes of profile:

- **Compile profiles** (`base`, `linux`, `darwin`, `linux-amd64`, …) apply to *every* translation unit and link stage in the dependency-build pipeline (Netty C, BoringSSL, autoconf conftests, …). Anything here must be safe at intermediate link stages.
- **Binary profiles** (`*-bin`) apply only at the consuming project's *final* executable / shared-library / dylib link. They hold flags — section stripping, undefined-symbol rejection, debug compression, fatal warnings — that would break a dependency's intermediate conftest or test-binary link if applied earlier. The chain mirrors the compile side: an OS-level `linux-bin` / `darwin-bin` carries the OS-wide final-link flags, and a leaf `*-arch-bin` layers any arch-specific final-link flags on top. The full rollup for `linux-amd64-bin` is `base → linux → linux-amd64 → linux-bin → linux-amd64-bin`.

## Toolchain & deployment floor

These flags assume the following floor; downstream consumers should match
or override per-profile.

| Layer                       | Floor                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| Compiler                    | mainline LLVM **clang 22.x** (Polly-enabled), on every platform          |
| Linker                      | **lld** (`ld.lld` on Linux, `ld64.lld` on Darwin)                        |
| Linux libc                  | **musl 1.2.x** primary; **glibc 2.36+** for any glibc consumers          |
| Linux libc++                | Vendored libc++ (Linux/amd64); `_LIBCPP_HARDENING_MODE` honored          |
| macOS                       | macOS 12+ (dyld 4 / chained-fixups format)                               |
| Linux/amd64 ISA             | `x86-64-v3` + `aes`/`pclmul`/`sha`/`vaes`/`gfni`/`rdrand` → Ice Lake / Zen 3+ |
| Darwin/amd64 ISA            | `x86-64-v3` + `aes`/`pclmul`/`rdrand` → all Intel Macs (Ivy Bridge+)     |
| Linux/arm64 ISA             | `armv8.2-a` + `crypto`/`crc`/`dotprod` → Graviton 2+, Neoverse N1+, Altra |
| Darwin/arm64 ISA            | `apple-m1` (ARMv8.5-A) — every shipping Apple Silicon Mac                |

## Features

Compiler features activated or facilitated by these flags:

| Feature                       | Platforms     | Description                                                       |
| ----------------------------- | ------------- | ----------------------------------------------------------------- |
| [Thin LTO][9]                 | All           | Emits and optimizes as LLVM bitcode, program-wide                 |
| Function/Data Sections        | All           | `-f{data,function}-sections` (collected at *final* link, see below) |
| Stack Hardening               | All           | `-fstack-protector-strong`, `-fstack-clash-protection` (Linux)    |
| Register Zeroing              | All           | `-fzero-call-used-regs=used-gpr` shrinks ROP/JOP gadget surface   |
| Async Unwind Tables           | All           | `-fasynchronous-unwind-tables` for profilers + crash collectors   |
| FORTIFY_SOURCE=2              | Linux + Darwin| musl-compatible level 2; glibc consumers may override to `=3`     |
| libc++ hardening (FAST)       | Linux + Darwin| `_LIBCPP_HARDENING_MODE_FAST` for vendored / Apple libc++         |
| [LLD][10] as linker           | All           | `-fuse-ld=lld` required for Thin LTO                              |
| Full RELRO + `-fno-plt`       | Linux         | `-z relro -z now` plus PLT-less call lowering                     |
| No semantic interposition     | Linux         | `-fno-semantic-interposition` for intra-DSO inlining              |
| DT_RELR relative relocations  | Linux         | `-z pack-relative-relocs` shrinks PIE relocation tables           |
| LLD ICF (safe)                | Linux         | `--icf=safe` folds identical address-not-taken functions          |
| Relative C++ ABI vtables      | Linux         | Enables relative vtable references program-wide                   |
| Linker-driven Reordering      | Linux amd64   | Emits `-fbasic-block-sections=all` for reordering                 |
| Intel CET (IBT + shadow stk)  | Linux amd64   | `-fcf-protection=full`                                            |
| Microarch tuning              | Linux amd64   | `-mtune=znver3` (mirrors Rust `-Ztune-cpu=znver3`)                |
| PAC + BTI                     | arm64 (both)  | `-mbranch-protection=standard`; `-z force-bti` on Linux           |
| Mach-O fixup chains           | Darwin        | `-bind_at_load`, `-fixup_chains`, `-no_data_in_code_info`         |

> [!IMPORTANT]
> **Section-stripping and similar "no further link" flags live in `*-bin`,
> not in the per-OS or per-arch compile profiles.** The compile profiles
> are applied to dependency builds (Netty, BoringSSL TCNative, autoconf
> conftests, …) where intermediate links still reference symbols that
> `-Wl,--gc-sections` / `-Wl,-dead_strip` would otherwise drop. The
> compiler still emits per-function/data sections via
> `-ffunction-sections` / `-fdata-sections`, so the consuming project
> picks up the full DCE win by selecting the corresponding `*-bin`
> profile (e.g. `linux-amd64-bin`) at its **own** final link step.

> [!NOTE]
> `-Wconversion` is intentionally not enabled — it's too noisy across Netty's
> JNI glue and BoringSSL's x86 intrinsics to be useful as a blanket warning.
> Re-enable selectively per-target if needed.

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

Applied **only** at the consuming project's final executable / shared-library / dylib link step. Holds flags that would break intermediate dependency-build links (autoconf conftests, BoringSSL test binaries, …). Roll-up: a `*-bin` profile inherits its compile-profile chain first, then adds the OS-wide `*-bin` layer, then the per-arch `*-arch-bin` layer. The full rollup for `linux-amd64-bin` is `base → linux → linux-amd64 → linux-bin → linux-amd64-bin`.

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

## Downstream Projects

So far, the following projects consume these flags:

- [Netty][7] (`epoll`, `kqueue`, `io_uring`, etc.)
- [Netty TCNative][8] (BoringSSL-based TLS)

[0]: ./base.txt
[1]: ./linux.txt
[2]: ./linux-amd64.txt
[3]: ./linux-arm64.txt
[4]: ./darwin.txt
[5]: ./darwin-amd64.txt
[6]: ./darwin-arm64.txt
[7]: https://github.com/elide-dev/netty
[8]: https://github.com/elide-dev/netty-tcnative
[9]: https://clang.llvm.org/docs/ThinLTO.html
[10]: https://lld.llvm.org/
[11]: ./linux-amd64-bin.txt
[12]: ./linux-arm64-bin.txt
[13]: ./darwin-amd64-bin.txt
[14]: ./darwin-arm64-bin.txt
[15]: ./linux-bin.txt
[16]: ./darwin-bin.txt
