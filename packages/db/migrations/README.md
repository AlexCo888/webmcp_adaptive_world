# Migration notes

Run `0001_initial_schema.sql` and then `0002_row_level_security.sql` with the
direct Neon connection. Provisioning must then:

1. Create a non-owner runtime role.
2. Grant that role only the table/sequence privileges each API requires.
3. Grant `EXECUTE` on `app_is_admin`, `app_owns_patient`,
   `app_has_patient_scope`, and `redeem_context_grant`.
4. Keep the owner/migration credential out of Vercel runtime environments.

Because PostgreSQL owners normally bypass RLS, using the owner credential at
runtime would defeat the policies. Preview deployments should use isolated Neon
branches and must never contain production medical data.
