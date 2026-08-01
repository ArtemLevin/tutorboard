# Coordinate plot release budgets

## Numerical safety limits

| Limit | Release value |
|---|---:|
| Stored series per coordinate plane | 32 |
| Shared parameters per coordinate plane | 26 |
| Sampled points per series | 12,000 |
| Sampling evaluations per series | 50,000 |
| Sampled points per coordinate plane | 80,000 |
| Adaptive subdivision depth | 12 |
| Coordinate planes in representative page workload | 16 |
| Sampling cache entries | 128 |

## Shared-runner timing budgets

Timing budgets protect against large regressions while allowing normal variance on GitHub-hosted runners.

| Workload | Budget |
|---|---:|
| One representative multi-series plane: compile and sample | 2,000 ms |
| Sixteen-plane representative page: compile and sample | 6,000 ms |
| Warm-cache replay of the sixteen-plane page | 1,500 ms |
| BoardDocument serialize and deserialize round-trip | 1,000 ms |
| Scene selection for the sixteen-plane page | 1,000 ms |

The tests also assert deterministic output, bounded point and evaluation counters and a bounded cache size. Wall-clock time alone never authorizes exceeding a numerical safety limit.

## Browser budgets

The production browser lifecycle test uses Playwright's default test timeout and runs in both Chromium and Firefox. It must finish creation, save, IndexedDB restoration, duplication and JSON export without retries on a normal local developer machine. CI permits the repository-level retry policy for transient browser startup failures.

## Review policy

Any increase to a numerical limit or timing budget requires:

1. a benchmark showing the affected workload;
2. an explanation of the user-visible benefit;
3. memory and cancellation analysis;
4. updated tests and documentation;
5. approval through a dedicated pull request.
