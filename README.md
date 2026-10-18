# ANTONOVIUM

Cloud-library implementation based on the original React application.
The original design and the local workspace format are preserved.

The production website remains on main. This branch is awaiting private
storage activation and real authenticated upload/synchronization checks.
See source/docs/CLOUD_STATUS.md.

Source and pinned dependencies are in source/:

```sh
cd source
npm ci
npm run build
npm test
npm run test:cloud
npm run test:pdf
```

The root contains the build for GitHub Pages. After changes, copy the contents
of source/dist/ to the repository root before publishing from main.
Keep Yandex credentials in Supabase Edge Function secrets, never in frontend
variables or GitHub files.
