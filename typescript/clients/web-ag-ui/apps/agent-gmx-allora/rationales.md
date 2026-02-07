# GMX Allora Agent Rationales

## Strategy Rule Format

We derive a normalized confidence score from Allora's confidence interval band to keep signal selection deterministic and auditable.

**Rule**
- Use the inner band of `confidence_interval_values` (P15.87, P84.13 when available) to estimate spread.
- Compute `confidence = 1 - (upper - lower) / max(|combined_value|, 1)`.
- Clamp to `[0, 1]` and round to 2 decimals.

**Why**
- Allora's API provides an inference band but not a single confidence scalar. The spread-to-price ratio yields a consistent, explainable score without introducing probabilistic modeling.

**Trade-offs**
- This is a heuristic and may under/over-estimate confidence in volatile regimes; it is deterministic and easy to audit, which matches the PRD requirement.

## Position Sizing Safety Buffer

We allocate `baseContributionUsd * 0.8` (20% buffer) for position sizing.

**Why**
- The PRD requires a safety buffer that tolerates roughly 20% adverse movement. Using 80% of the allocation keeps exposure below the full balance while preserving deterministic sizing.

**Trade-offs**
- This may underutilize capital during strong signals, but it keeps the strategy conservative by design.
