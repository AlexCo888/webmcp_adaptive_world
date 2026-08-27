# `@adaptive-world/db`

Drizzle schema and Neon HTTP client for the Passport and Gym applications.

- Application traffic should use Neon's pooled URL.
- Migrations should use the direct URL.
- Raw context tokens are never stored; `context_grants.token_hash` is SHA-256.
- Context grant redemption is one atomic conditional `UPDATE ... RETURNING`.
- Uploaded document `blob_key` values point to private object storage, never a
  public URL.
- RLS is defense in depth. The API must still authorize every operation.

When RLS is enabled, connect as a non-owner application role and wrap protected
queries in a transaction that calls `setRlsIdentity`. PostgreSQL table owners
normally bypass RLS; do not use the migration owner as the runtime role.
