# Cloud library implementation status

The original production build is retained in `backup/pre-cloud-2026-10-18`.
The cloud-library branch contains the recovered original React source, new
library modules, production build, database migrations and Edge Functions.

Implemented: private owner-scoped catalog, PDF.js text/image reader, safe FB2
parser, server-signed Yandex URLs, multipart transfer above 64 MiB, progress,
bookmarks, anchored notes, metadata editing, local workspace migration and
version conflicts. Guest local data is kept under its original key; signed-in
workspaces use separate user keys. No book is committed to GitHub.

Deployed: four isolated RLS tables, two RPC functions and two Edge Functions in
the existing Supabase Free project. Existing project tables are unchanged.

Activation blockers:

- The approved owner email is allowlisted in Supabase; it remains unbound until
  the owner's first authenticated sign-in.
- A Yandex Cloud billing account is linked to the new cloud. Creating a private
  standard bucket with a 1 GiB capacity limit returned `Access Denied` on
  2026-10-18. The signed-in account has inherited cloud-owner rights, so the
  cause is not established. The billing account's activation status needs
  verification. No bucket or access key has been created, and no storage usage
  has been incurred. Bucket-scoped permissions, CORS, unfinished-upload
  lifecycle and server secrets remain to be configured.
- Supabase Auth must allow the existing Pages URL as the sign-in redirect;
  new registrations should be disabled after the approved owner is verified.
- Real PDF/FB2 uploads, expiring URLs, authorized foreign-owner denial and two
  independent authenticated browser profiles remain untested.

Local checks: 19 application checks, 8 FB2/migration/security checks, 4 PDF checks,
and strict frontend/backend TypeScript checks. Local tests cover the preserved application, FB2 parsing/security/migration and
an actual 66+ MiB PDF with range reads and an image-only page. These are not
evidence of a completed cloud upload or cross-device synchronization.

Access from a Russian network has not been tested.
