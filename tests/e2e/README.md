# End-to-end release gate

Playwright exercises the BI reference application across Chromium, Firefox,
WebKit, 1440×900 desktop, 1024×768 compact, and Chromium DPR 2. Failures retain
trace and screenshot evidence; key paths attach GroundingBundle and
ContextBundle JSON to the report.

The suite contains BI-01 through BI-20 plus M5 accessibility, debug-disclosure,
long-task, reduced-motion, 200% zoom, and disabled-baseline checks.
