# Registered sample-size procedure

The counts in `design.json` are capacity-aware planning targets. They are not
post-hoc evidence of adequate power.

After infrastructure calibration and before confirmatory outcomes:

1. Estimate, per benchmark stratum, the control success rate and paired
   discordance rate from calibration tasks that are permanently excluded from
   inference.
2. Define the smallest effect of interest as an absolute 5 percentage-point UGP
   improvement for long-horizon/safety strata and 7 points for single-step
   referent strata. Any change requires a dated design revision before outcomes.
3. Simulate the paired task-by-condition design with the registered task/domain
   clustering and both actor models. Use at least 10,000 simulations.
4. Apply the same Holm family correction as the confirmatory analysis.
5. Require at least 80% power for each primary UGP contrast and at least 90%
   power for the pooled referent and action-family contrasts.
6. If the available benchmark is smaller than the required count, run the full
   eligible set, report the detectable effect, and label the corresponding
   hypothesis underpowered rather than changing the effect threshold.

The simulation input, code version, calibration task IDs, random seed, and full
power curves are sealed in `.runs/power/`. The chosen count is locked before any
main-table result is opened. The negative-control ScreenQA stratum is sized for
an equivalence-style bound, not for proving a positive UGP effect.
