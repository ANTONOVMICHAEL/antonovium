# Unified workspace update · 21 October 2026

The application remains at https://antonovmichael.github.io/antonovium/.
Hosting, the existing Supabase project, private Yandex bucket and owner allowlist are preserved.

## Behavior

- Email/password sign-in is the default; sessions persist. Email link recovery remains available. An authenticated owner can set a new password.
- New PDF/FB2 uploads default to the shared library. Explicit device-only file storage remains available.
- Previously stored local books automatically copy to the private shared library after sign-in. Migration preserves originals, maps anchored notes to the shared book, and imports local progress/bookmarks. Fingerprints prevent duplicate cloud uploads. Interrupted transfers retry while the application is open.
- Original guest sources, notes, research and manuscript are imported automatically once per account/browser. The original workspace key is retained.
- Entity sync reads remote revisions before sending local changes. It polls every five seconds and refreshes on focus, visibility changes and reconnection. Unsent edits remain in the user's local workspace.
- Notes/highlights/comments, research, source texts, manuscript, reader settings and text positions sync. PDF/FB2 progress and bookmarks use the existing owner-scoped entity APIs.
- Concurrent note changes preserve separate note copies. Other conflicting edits create an explicit conflict record containing both versions. Deletions use tombstones.
- Local cached backups of migrated files are hidden from the signed-in catalog to avoid duplicate entries and resurrection after shared deletion.

## Verification performed

- Frontend TypeScript and production build passed.
- 19 production DOM regression checks passed; two stale selectors in the older test suite were updated to the current button labels.
- 10 FB2/highlight/migration/source security checks passed.
- 8 React integration scenarios passed with two independent workspaces and a simulated revision transport: note create/edit propagation; idle stale-device pull; manuscript propagation; simultaneous manuscript conflict; offline retry; deletion propagation; text position sync; no writes for unchanged state.
- A transaction against the actual database, under the authenticated owner role, verified initial write, revision increment, stale-write rejection and owner isolation. Every verification row was rolled back.
- Actual private object storage accepted a temporary FB2 object; a signed GET returned exactly the original bytes. Only the temporary verification object was then removed. Credentials were passed through hidden stdin and were never saved in source or files.
- Browser QA confirmed the new password form and preserved application startup.

## Remaining verification limit

An end-to-end sign-in and book/note transfer between the owner's physical phone and computer has not been performed. That requires the owner to sign in on both devices. No password has been changed or generated on the owner's behalf. The 1 GiB storage limit configured previously is unchanged.
