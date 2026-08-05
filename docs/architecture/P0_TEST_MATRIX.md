# P0 integrity test matrix

| Scenario | Expected result |
| --- | --- |
| Valid command round-trip | Exact decoded command |
| Extra command field | Codec rejection |
| Unknown command kind | Codec rejection |
| Incomplete board object | Codec rejection |
| Malformed command JSON | Quarantine before replay |
| Modified command hash | Quarantine before replay |
| Damaged sequence followed by valid commands | Damaged record plus dependent tail quarantined |
| Legacy queue record | Lazy migration to schema v2 |
| Property insertion order differs | Identical canonical JSON and SHA-256 |
| Confirmed head has wrong document hash | Cache rejection |
| Confirmed head has another document ID | Cache rejection |
