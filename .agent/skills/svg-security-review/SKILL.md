---
name: svg-security-review
description: >
  Review TutorBoard SVG import, sanitization, rendering, export, URLs, data URIs,
  bounds, and complexity limits. Use whenever untrusted SVG or SVG-derived
  content can enter, persist in, render from, or leave the application.
---

# Purpose

Make SVG handling deny-by-default, bounded, and independent from mathematical
semantics.

# Required context

Read `../../../PLAN.md` sections 6.7 and 7.3, the sanitizer configuration,
rendering path, persistence shape, and malicious fixtures.

# Workflow

1. Trace bytes from input through validation, sanitization, storage, rendering,
   export, errors, and logs.
2. Reject scripts, event handlers, `foreignObject`, external resources, unsafe
   URL/data schemes, and unsupported XML features.
3. Enforce byte, node, depth, dimension, and parsing-time limits.
4. Check that sanitized output is not made unsafe by later mutation.
5. Verify malformed and oversized input fails without exposing raw content.
6. Ensure SVG is one visual board object and never the primary GIR source.
7. Require malicious fixtures and a real-browser smoke test.

# Output

Return trust boundaries, sanitizer policy, limits, invariant IDs, exploit paths,
fixtures/checks, findings, and residual browser risk.

