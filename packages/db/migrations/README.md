# Migration notes

Run every migration recorded in `meta/_journal.json`, in order, with the direct
Neon migration connection:

```sh
pnpm --filter @adaptive-world/db migrate
```

The current journal ends at `0008_patient_lock_order.sql`. Provisioning
must then:

1. Create a non-owner runtime role.
2. Grant that role only the table/sequence privileges each API requires.
3. Grant `EXECUTE` only on the routines each runtime needs. The Passport and Gym
   paths currently use `app_is_admin`, `app_owns_patient`,
   `app_has_patient_scope`, and `redeem_context_grant_session`; do not restore
   the migrations' revoked `PUBLIC` access.
4. Keep the owner/migration credential out of Vercel runtime environments.

Because PostgreSQL owners normally bypass RLS, using the owner credential at
runtime would defeat the policies. Preview deployments should use isolated Neon
branches and must never contain production medical data.
