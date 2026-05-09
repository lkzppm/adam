# Hono benchmark — Orientation / Additive coding / Multi-coding (refactor)

All paired runs: same prompt to baseline (no spec, no graph) vs adam (CLAUDE.md + spec/ + gitnexus MCP).

## Orientation (n=10)

*Asking the model to explain or locate code*

| Task | Topic | Baseline cost | Adam cost | Δ cost |
|---|---|---:|---:|---:|
| T1 | middleware-compose | $0.2239 | $0.1351 | -39.7% |
| T1b | router-add | $0.1981 | $0.2240 | +13.1% |
| T1c | cors-preflight | $0.0926 | $0.0735 | -20.6% |
| T1d | lambda-adapter | $0.1367 | $0.1029 | -24.7% |
| T1e | router-variants | $0.2024 | $0.2047 | +1.2% |
| T1f | jwt-algorithms | $0.2488 | $0.1061 | -57.4% |
| T1g | context-renderers | $0.1374 | $0.0892 | -35.1% |
| T1h | context-storage | $0.2249 | $0.0849 | -62.2% |
| T1i | body-parser | $0.1151 | $0.1037 | -9.9% |
| T1j | add-builtin-middleware | $0.1241 | $0.1127 | -9.1% |

**Orientation aggregate:** $1.7039 → $1.2368 (-27.4% cost, -15.0% tokens, -26 turns).

## Additive coding (n=10)

*Adding a single utility helper to one file*

| Task | Topic | Baseline turns / cost / tsc | Adam turns / cost / tsc | Δ cost |
|---|---|---:|---:|---:|
| T2 | middleware-body-cap | 6 / $0.1504 / ✓ | 6 / $0.1007 / ✓ | -33.1% |
| T2b | middleware-request-time | 6 / $0.1424 / ✓ | 6 / $0.0908 / ✓ | -36.3% |
| T2c | middleware-language-tag | 11 / $0.2834 / ✓ | 5 / $0.0836 / ✓ | -70.5% |
| T2d | middleware-if-none-match | 6 / $0.2217 / ✓ | 6 / $0.0887 / ✓ | -60.0% |
| T2e | middleware-health | 4 / $0.2497 / ✓ | 4 / $0.0746 / ✓ | -70.1% |
| T2f | helper-request-info | 15 / $0.2884 / ✓ | 6 / $0.0979 / ✓ | -66.1% |
| T2g | helper-bearer | 8 / $0.1099 / ✓ | 5 / $0.0792 / ✓ | -28.0% |
| T2h | helper-clear-cookies | 4 / $0.1174 / ✓ | 5 / $0.0820 / ✓ | -30.1% |
| T2i | context-not-modified | 6 / $0.1228 / ✓ | 5 / $0.0840 / ✓ | -31.6% |
| T2j | context-problem | 7 / $0.1065 / ✓ | 6 / $0.1076 / ✓ | +1.1% |

**Additive coding aggregate:** $1.7926 → $0.8889 (-50.4% cost, -30.7% tokens, -19 turns).
Quality: baseline tsc-pass 10/10, adam tsc-pass 10/10.

## Multi-coding (refactor) (n=10)

*Cross-file refactor (rename / signature change)*

| Task | Topic | Baseline turns / cost / tsc | Adam turns / cost / tsc | Δ cost |
|---|---|---:|---:|---:|
| T3 | rename-html-helper | 14 / $0.2792 / ✓ | 19 / $0.2274 / ✓ | -18.5% |
| T3b | rename-raw-html | 75 / $0.9797 / ✓ | 65 / $0.5974 / ✓ | -39.0% |
| T3c | rename-httpexception | 50 / $0.7316 / ✓ | 45 / $0.3513 / ✓ | -52.0% |
| T3d | rename-cookie-helpers | 30 / $0.2051 / ✓ | 27 / $0.2338 / ✓ | +14.0% |
| T3e | rename-jwt-sign-verify | 9 / $0.2986 / ✓ | 21 / $0.3702 / ✓ | +24.0% |
| T3f | rename-jsxnode | 70 / $0.9945 / ✓ | 27 / $0.5391 / ✓ | -45.8% |
| T3g | rename-honobase | 28 / $0.3409 / ✓ | 25 / $0.2561 / ✓ | -24.9% |
| T3h | rename-wscontext | 17 / $0.1889 / ✓ | 16 / $0.1542 / ✓ | -18.4% |
| T3i | rename-compose | 18 / $0.2275 / ✓ | 17 / $0.1649 / ✓ | -27.5% |
| T3j | rename-base64 | 25 / $0.2567 / ✓ | 32 / $0.2476 / ✓ | -3.5% |

**Multi-coding (refactor) aggregate:** $4.5027 → $3.1420 (-30.2% cost, -47.1% tokens, -42 turns).
Quality: baseline tsc-pass 10/10, adam tsc-pass 10/10.

## Total (30 tasks)

| | Tokens | Cost | Turns |
|---|---:|---:|---:|
| baseline | 10,785,305 | $7.9993 | 489 |
| **adam** | **6,437,333** | **$5.2678** | **402** |
| **Δ** | **-40.3%** | **-34.1%** | **-87** |
