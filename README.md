# Elide's C Flags

Tree of simple text files which compound into final clang and LLD flags when building Elide. On Unix-like platforms, Elide and related repos may consult this one to build with a uniform suite of flags across compilation units.

Flag files allow comments which start with `#`. Comments are thus inline explaining the purpose of most flags.

## Features

Compiler features activated or facilitated by these flags:

| Feature                       | Platforms     | Description                                                       |
| ----------------------------- | ------------- | ----------------------------------------------------------------- |
| [Thin LTO][9]                 | All           | Emits and optimizes as LLVM bitcode, program-wide                 |
| Function/Data Sections        | All           | `-f{data,function}-sections` for link-time DCE                    |
| Stack Hardening               | All           | `-fstack-protector-strong`, `-fstack-clash-protection` (Linux)    |
| Register Zeroing              | All           | `-fzero-call-used-regs=used-gpr` shrinks ROP/JOP gadget surface   |
| Async Unwind Tables           | All           | `-fasynchronous-unwind-tables` for profilers + crash collectors   |
| FORTIFY_SOURCE                | All           | Level 3 on glibc, level 2 on Apple libc                           |
| C++ stdlib hardening          | All           | `_GLIBCXX_ASSERTIONS` (Linux) / `_LIBCPP_HARDENING_MODE` (Darwin) |
| [LLD][10] as linker           | All           | `-fuse-ld=lld` required for Thin LTO                              |
| Full RELRO + `-fno-plt`       | Linux         | `-z relro -z now` plus PLT-less call lowering                     |
| No semantic interposition     | Linux         | `-fno-semantic-interposition` for intra-DSO inlining              |
| DT_RELR relative relocations  | Linux         | `-z pack-relative-relocs` shrinks PIE relocation tables           |
| LLD ICF (safe)                | Linux         | `--icf=safe` folds identical address-not-taken functions          |
| Relative C++ ABI vtables      | Linux         | Enables relative vtable references program-wide                   |
| Linker-driven Reordering      | Linux amd64   | Emits `-fbasic-block-sections=all` for reordering                 |
| `x86-64-v3` ISA baseline      | amd64         | Haswell-class floor (AVX2/BMI2/FMA/F16C/LZCNT/MOVBE)              |
| Intel CET (IBT + shadow stk)  | Linux amd64   | `-fcf-protection=full`                                            |
| `armv8.2-a` + crypto baseline | Linux arm64   | Server arm64 floor with AES/SHA/PMULL/CRC/dotprod                 |
| `apple-m1` baseline           | Darwin arm64  | Apple Silicon scheduling + ARMv8.5-A features                     |
| PAC + BTI                     | arm64 (both)  | `-mbranch-protection=standard`; `-z force-bti` on Linux           |
| Mach-O hardening              | Darwin        | `-dead_strip`, `-bind_at_load`, `-fixup_chains`                   |

## Flag Profiles

The following profiles are supported, and roll-up where supported (e.g. `linux-amd64` gets `base.txt`, then `linux.txt`, then `linux-amd64.txt`):

| Profile | OS | Arch | Description |
| --------- | ---- | ---- | -------- |
| [base][0] | (All) | (All) | Baseline flags. |
| [linux][1] | Linux | (All) | Linux-only flags. |
| [linux-amd64][2] | Linux | amd64 | Linux x86-64 flags. |
| [linux-arm64][3] | Linux | aarch64 | Linux ARM64 flags. |
| [darwin][4] | macOS | (All) | macOS-only flags. |
| [darwin-amd64][5] | Darwin | amd64 | macOS Intel flags. |
| [darwin-arm64][6] | Darwin | aarch64 | macOS M-series flags. |

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
