# Selection model

Status: **Normative v0.1 Alpha**

UGP v0.1 defines point, rectangular region, and text selection. Free-form lasso
is experimental. Every Selection carries a unique identifier, Surface identity
and revision, input mode, creation time, source, and one or more Selectors.

Point and region geometry use CSS-pixel coordinates unless an Adapter explicitly
declares another coordinate space and deterministic transform. Zero-area region
geometry is valid input and resolves according to point semantics only when the
host explicitly requests that fallback.

Text selections should pair a TextQuoteSelector with TextPositionSelector. The
quote supports reconnection after unrelated edits; the position detects
ambiguous repeated text. A revision mismatch prevents silent reconnection.

Selection records describe user evidence. They do not identify a business object
and never authorize an action.
