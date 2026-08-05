# Board envelope v1.3 validation

The release gate covers the complete unit suite, ordered sync recovery, clock-skew handling, Chromium and Firefox smoke tests, Smart Ink, Formula Recognition, the production image and container security checks.

Clock-skewed commands are applied according to server revision and Lamport metadata. The reducer preserves the later confirmed `updatedAt` instant.
