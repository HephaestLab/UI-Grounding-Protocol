# ADR-008: Browser support requires two evidence layers

- Status: Accepted
- Date: 2026-08-27

## Decision

Chromium, Firefox, and WebKit behavior is verified by Playwright-based automated
tests. Release candidates also undergo a production-build black-box pass in the
Codex in-app browser with screenshots and GroundingBundle artifacts.

## Consequences

DOM, Pointer, Range, clipping, scrolling, transforms, Shadow DOM, and observer
behavior are not accepted based on simulated DOM tests alone.
