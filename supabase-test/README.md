# Sibil Supabase migration test

Isolated test copy; production remains on Apps Script. Do not move these app files into public/ or switch production until browser end-to-end tests and a final source reconciliation pass.

- app/: test frontend, Supabase Auth, minimum signup password 8 characters; only a publishable key is included.
- backend.sql: applied test schema and service-role-only RPC. Requires the existing private sibil_stage snapshot schema/data. Not a standalone production migration.
- backend-tests.sql: transactional database tests, rolled back on completion.
- functions/sibil-test-api/index.ts: deployed test Edge Function; verify_jwt=true. Validates the verified admin identity before invoking privileged RPC. Backend secrets come from Edge runtime environment only.

Database tests and twelve-month dashboard comparisons passed. Real admin login and browser saves are pending email verification. Snapshot/customer exports, credentials and personal source data are intentionally excluded from this repository.

Run a local preview with `python -m http.server 8766 --bind 127.0.0.1 --directory supabase-test/app`. The hosted private test is separate from GitHub Pages.
