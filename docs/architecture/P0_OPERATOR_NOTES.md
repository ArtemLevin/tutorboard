# P0 integrity operator notes

A quarantine event indicates damaged or incompatible local pending data. The
active queue excludes the damaged record and every later dependent command.
Operators should preserve the local database, export diagnostics through the
future recovery UI and avoid direct IndexedDB editing.

Repeated quarantine growth after a clean browser profile indicates a client or
migration defect and blocks release promotion.
