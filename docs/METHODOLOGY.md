# Research methodology

Omega is an offline, snapshot-based research workspace. The reference dataset is dated November 14, 2026. Its outputs are conditional estimates, not live trading signals.

## Universe and classification

The supplied release audit reconciles 758 unique records: 184 ranked candidates (40 official watchlist and 144 additional candidates), 416 recorded-token records, and 158 exclusions. No token recorded in the dataset is not proof that a token does not exist. Ecosystem-token and stablecoin flags can restrict farming even for ranked watchlist records.

## Valuation

Model D combines a Huber log-linear comparable base, shrunk empirical-Bayes sector/category adjustments, bounded seven-day TVL growth and tracking-age maturity. The latter two factors are heuristics, not fitted causal effects. Tracking age is not launch age. The target is circulating market capitalization conditional on a launch, not FDV or probability-weighted value.

| Reported validation metric | Result |
|---|---:|
| Comparable sample | 89 |
| Leave-one-out median multiplicative error | 3.06× |
| Nominal 80% nested LOO coverage | 79.8% |
| Later-listed holdout coverage, nominal 80% | 61.9% (21 records) |
| Base-only model LOO RMSE | 2.020 |
| Model D LOO RMSE | 2.028 |

The later-listed split is cross-sectional, not a historical launch backtest. Model D improves selected median and tail metrics but worsens RMSE relative to the base-only model. Its nominal bands are symmetric log-error bands, not empirical predictive percentiles; peer incidence is descriptive, not a launch probability. Sparse categories use sector fallback.

## Conditional farming scenarios

Gross modeled reward = conditional spot market cap × assumed distribution share × min(2%, capital / TVL) × assumed realization.

Net subtracts cash friction, opportunity cost and modeled principal loss, and adds explicitly hypothetical base yield where applicable. TVL share is not entitlement. The snapshot does not verify APY, allocation rules, eligibility, vesting, contract safety or future liquidity.

At the reference assumptions ($1,000 capital, 7% distribution, 100% realization, 0% base yield and principal loss, 4% opportunity APR), the supplied V4.2 audit reports 46 ungated central hurdle-qualified rows and zero lower-band-qualified rows at $10/hour. Zero reward with zero assumed base yield produces no positive rows.

Execution gates are screening flags, not safety certification. All costs, lockups and steps require verification before execution.

## Source

- [Analytical engine](https://github.com/amitkumar-bit/alpha-radar-omega-token-radar-01/blob/f6bd53c7d47fdf07c2adf84ffa7920369953762b/dashboard/analysis.js)
- [Watchlist playbooks](https://github.com/amitkumar-bit/alpha-radar-omega-token-radar-01/blob/f6bd53c7d47fdf07c2adf84ffa7920369953762b/lib/watchlist_specs.ts)
- [Farm specification generator](https://github.com/amitkumar-bit/alpha-radar-omega-token-radar-01/blob/f6bd53c7d47fdf07c2adf84ffa7920369953762b/lib/farm_specs.ts)

Metrics are from the supplied release audit, not independently rerun by this documentation update.
