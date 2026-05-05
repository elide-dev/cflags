#!/usr/bin/env bash
# Print the concatenated, comment-stripped clang/lld flag set for a given
# (os, arch) pair, optionally including the *-bin final-link layer.
#
# Usage:
#   cflags.sh                       # host os, host arch, compile profile
#   cflags.sh <os> <arch>           # explicit (os, arch), compile profile
#   cflags.sh <os> <arch> --bin     # explicit (os, arch), binary (final-link) profile
#   cflags.sh --bin                 # host os, host arch, binary profile
#
# Output is whitespace-separated on a single line, suitable for:
#   export CFLAGS="$(./cli/cflags.sh)"
#   export LDFLAGS="$(./cli/cflags.sh --bin)"
#
# Recognized values:
#   <os>:   linux | darwin
#   <arch>: amd64 | arm64

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "${script_dir}/.." && pwd -P)"

usage() {
  sed -n '2,/^$/{s/^# \{0,1\}//;p;}' "${BASH_SOURCE[0]}" >&2
}

host_os() {
  case "$(uname -s)" in
    Linux)  echo linux ;;
    Darwin) echo darwin ;;
    *)      echo "cflags: unsupported host os: $(uname -s)" >&2; exit 2 ;;
  esac
}

host_arch() {
  case "$(uname -m)" in
    x86_64|amd64)   echo amd64 ;;
    arm64|aarch64)  echo arm64 ;;
    *)              echo "cflags: unsupported host arch: $(uname -m)" >&2; exit 2 ;;
  esac
}

bin=0
positional=()
for arg in "$@"; do
  case "$arg" in
    --bin)        bin=1 ;;
    -h|--help)    usage; exit 0 ;;
    --)           ;;
    -*)           echo "cflags: unknown option: $arg" >&2; exit 2 ;;
    *)            positional+=("$arg") ;;
  esac
done

if [[ ${#positional[@]} -gt 2 ]]; then
  echo "cflags: too many positional arguments (expected at most 2: <os> <arch>)" >&2
  exit 2
fi

os="${positional[0]:-$(host_os)}"
arch="${positional[1]:-$(host_arch)}"

case "$os" in
  linux|darwin) ;;
  *) echo "cflags: unsupported os: $os (expected: linux | darwin)" >&2; exit 2 ;;
esac
case "$arch" in
  amd64|arm64) ;;
  *) echo "cflags: unsupported arch: $arch (expected: amd64 | arm64)" >&2; exit 2 ;;
esac

files=(
  "${root}/base.txt"
  "${root}/${os}.txt"
  "${root}/${os}-${arch}.txt"
)
if [[ $bin -eq 1 ]]; then
  files+=(
    "${root}/${os}-bin.txt"
    "${root}/${os}-${arch}-bin.txt"
  )
fi

for f in "${files[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "cflags: missing profile file: $f" >&2
    exit 1
  fi
done

# Strip end-of-line comments + blank lines, then collapse to a single
# whitespace-separated line. xargs with no command defaults to echo,
# which is exactly the join semantics we want.
sed -e 's/#.*$//' -e 's/[[:space:]]\{1,\}$//' "${files[@]}" \
  | grep -v '^[[:space:]]*$' \
  | xargs
