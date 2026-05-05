# Elide's C Flags

Tree of simple text files which compound into final clang and LLD flags when building Elide. On Unix-like platforms, Elide and related repos may consult this one to build with a uniform suite of flags across compilation units.

Flag files allow comments which start with `#`. Comments are thus inline explaining the purpose of most flags.

## Features

Compiler features activated or facilitated by these flags:

| Flag(s)      | Feature   | Platforms | Description                                       |
| ------------ | --------- | --------- | ------------------------------------------------- |
| `-flto=thin` | Thin LTO  | All       | Emits and optimizes as LLVM bitcode, program-wide |

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
