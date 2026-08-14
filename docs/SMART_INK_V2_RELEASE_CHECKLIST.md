# Smart Ink 2.0 release checklist

- [ ] `npm run check`
- [ ] Smart Ink production gate passes in Chromium and Firefox
- [ ] independent positive holdout passes in strict mode
- [ ] independent negative holdout passes in strict mode
- [ ] single-stroke arrow regression passes
- [ ] three-line composite arrow regression passes atomically
- [ ] ordinary-ink abstention diagnostics remain available
- [ ] field-corpus records remain local and `unreviewed`
- [ ] no BoardDocument schema change is introduced by the v2 intent layer
- [ ] shadow diagnostics are bounded to subscribers and do not affect board mutation
