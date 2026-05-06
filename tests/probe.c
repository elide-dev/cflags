/* probe.c — minimal C translation unit exercised by .github/workflows/ci.yml
 * with the resolved CFLAGS / LDFLAGS for each (os, arch) profile.
 *
 * Goals:
 *   - Compile + link cleanly with the full compile profile (`-c`) and the
 *     full binary profile (link to executable).
 *   - Touch a representative subset of codegen surfaces so a regression in
 *     any of the live flags breaks CI early: libc calls, function-pointer
 *     dispatch (indirect branches), a small loop (Polly / BB-sections),
 *     and stack-allocated string formatting (FORTIFY-relevant when the
 *     parked flags get phased back in).
 *
 * Must stay warning-clean under the live profile: -Wall -Wextra -Wpedantic
 * -Wformat=2 -Wstrict-prototypes -Wshadow -Wundef etc. Don't add anything
 * here that needs a -Wno-* override.
 */

#include <stdio.h>
#include <string.h>

typedef int (*op_fn)(int, int);

static int op_add(int a, int b) { return a + b; }
static int op_mul(int a, int b) { return a * b; }

int main(int argc, char **argv)
{
    (void)argv;

    const op_fn ops[2] = { op_add, op_mul };

    long total = 0;
    for (int i = 0; i < argc + 4; i++) {
        total += ops[i & 1](i, i + 1);
    }

    char buf[128];
    int n = snprintf(buf, sizeof(buf),
                     "elide cflags probe: argc=%d total=%ld len=%zu\n",
                     argc, total, strlen("ok"));
    if (n <= 0 || (size_t)n >= sizeof(buf)) {
        return 1;
    }
    if (fputs(buf, stdout) == EOF) {
        return 2;
    }
    return 0;
}
