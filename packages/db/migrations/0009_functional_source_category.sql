-- Synthetic Passport profiles seeded before functional provenance was added do
-- not have this key. Their functional preferences were self-reported. Backfill
-- only the missing key so valid or explicitly invalid provenance is untouched.
UPDATE patients
SET
  profile = jsonb_set(
    profile,
    '{functional,sourceCategory}',
    to_jsonb('self_reported'::text),
    true
  ),
  updated_at = now()
WHERE synthetic_demo = true
  AND jsonb_typeof(profile) = 'object'
  AND jsonb_typeof(profile->'functional') = 'object'
  AND NOT (profile->'functional' ? 'sourceCategory');
