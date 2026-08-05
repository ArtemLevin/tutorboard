# P0 integrity release checklist

- [ ] Every current `BoardCommand` kind has a strict runtime schema.
- [ ] Unknown kinds and unknown fields fail closed.
- [ ] Canonical JSON and SHA-256 are stable across property insertion order.
- [ ] Queue schema v1 records migrate to schema v2 without data loss.
- [ ] Invalid JSON is quarantined before reducer execution.
- [ ] Hash substitution is quarantined before replay.
- [ ] Commands after the first damaged sequence are marked `dependency-gap`.
- [ ] Confirmed cached heads verify document ID and SHA-256.
- [ ] Unit, integration, architecture and production build gates pass.
- [ ] Chromium and Firefox smoke suites pass.
- [ ] Quarantine diagnostics remain local until explicit user export.
