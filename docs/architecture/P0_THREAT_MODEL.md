# P0 command-integrity threat model

## Protected assets

- pending offline edits;
- confirmed board snapshots;
- command ordering metadata;
- tenant and actor attribution;
- diagnostic records that may contain lesson content.

## Threats covered by P0-01/P0-02

| Threat | Control |
| --- | --- |
| Malformed JSON in IndexedDB | bounded JSON reader and quarantine |
| Unknown command kind | strict discriminated runtime codec |
| Missing or malformed command payload | per-kind strict schema |
| Command payload substitution | canonical JSON SHA-256 |
| Actor metadata substitution | stored actor and decoded command comparison |
| Damaged middle queue record | quarantine of the record and dependent tail |
| Legacy queue drift | lazy validated migration to schema v2 |
| Cached-head substitution | canonical document SHA-256 verification |
| Client clock skew | Lamport storage reserved; ordering migration follows in P0-03 |

## Trust boundaries

The browser and IndexedDB are treated as untrusted persistence inputs. Runtime
validation happens before reducer execution. Quarantine records stay local and
must be treated as sensitive lesson data.
