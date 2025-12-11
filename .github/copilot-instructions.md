<!-- Copilot / AI agent instructions for BoardGameApp -->
# BoardGameApp — Agent Instructions

Purpose: help an AI code agent become productive quickly in this repo by highlighting architecture, conventions, workflows, and concrete examples.

- Big picture
  - Single-page client app (static files served from `index.html`) that runs entirely in the browser and talks to Firebase Firestore and Cloud Functions.
  - Client entry: `js/app.js` — contains UI wiring, group-scoped logic, and all Firestore client reads/writes.
  - BGG import/parse logic: `js/bgg.js` (parses BGG XML on the client before upload).
  - Firebase client config: `js/firebase-config.js` (public config; security via Firestore Rules).
  - Server: Firebase Cloud Functions in `functions/index.js` (callable functions `setPassword`, `validatePassword`, and an HTTP endpoint `generateAiSummary`).

- Key collections and data shapes (search these in `js/app.js` and `functions/index.js`)
  - `games` — top-level game catalog.
  - `groups/{groupId}/shortlist`, `groups/{groupId}/events`, `groups/{groupId}/polls` — group-scoped collections.
  - `groups/{groupId}/members/{username}` — member docs keyed by username; client expects username-based doc IDs.
  - `users/{username}` — user records stored by username (used for password metadata).
  - `user_wishlists`, `game_summaries`, `config` — shared helper collections.

- Important conventions and pitfalls
  - Usernames are used as document IDs (not UID strings). Code assumes `users` docs keyed by username; do not change that without wide refactor.
  - Group membership is stored both as a subcollection under `groups/<id>/members` and occasionally referenced by join code (field `joinCode`).
  - Local client state uses `localStorage` keys: `bgg_username`, `bgg_layout`, `bgg_lang`, `selected_group_id` — tests and features rely on these keys.
  - Summaries translations: `game_summaries` documents often have `description_en`, `description_de`, and `description_de_auto`. UI logic in `js/app.js` decides whether to show generator/translate buttons.
  - Firestore Rules are permissive in `firestore.rules` (currently `allow read, write: if true`). Do not assume production-level rules.

- Cloud Functions specifics
  - Functions are v2 style in `functions/index.js`. Secrets use `defineSecret('OPENROUTER_API_KEY')` and are accessed with `.value()` inside the function.
  - Callable functions: `exports.setPassword` and `exports.validatePassword` (client calls via `functions.httpsCallable(...)`).
  - HTTP endpoint: `exports.generateAiSummary` expects POST body `{ prompt, model? }` and proxies to OpenRouter.
  - Node engine in `functions/package.json` is `node: 22` — use compatible Node when running functions locally.

- Developer workflows (how to run and test locally)
  - Cloud Functions emulator: from `functions/` run `npm run serve` (starts `firebase emulators:start --only functions`).
  - Deploy functions: from `functions/` run `npm run deploy`.
  - Client: the app is static — open `index.html` in a browser or serve with a static server. When testing functions, run the functions emulator and point client to the emulator (or configure `firebase.json` emulators accordingly).

- Files to inspect when changing behavior
  - UI / logic: `js/app.js` (lots of business logic; prefer small, local edits and test in browser).
  - Parsing import: `js/bgg.js` (safe to reuse when changing upload/import flows).
  - Cloud code: `functions/index.js` (AI integration, password helpers — security-sensitive).
  - Translations: `locales/*.json` (en.json and de.json) — client reads `translations` at runtime.
  - Security: `firestore.rules` — currently permissive; update carefully and test with the emulator.

- Concrete examples for common tasks
  - Call the password function from client: `const setPasswordFn = functions.httpsCallable('setPassword'); await setPasswordFn({username, password});` (see `js/app.js`).
  - Generate AI summary (server): POST `{prompt}` to the function endpoint `generateAiSummary`; function uses OpenRouter secret `OPENROUTER_API_KEY` (see `functions/index.js`).
  - Parse BGG XML: call `parseBggXml(xmlText)` from `js/bgg.js` and then upload `games` docs to Firestore.

- Safe edit rules for agents
  - Avoid renaming core collections or changing document keying strategies (e.g., switching username → uid) without explicit developer sign-off and a migration plan (see `scripts/migrate_to_groups.js` for an example migration script pattern).
  - When modifying Cloud Functions: ensure secrets are preserved (`defineSecret`) and that calls to `.value()` are used correctly in v2 functions.
  - When touching `firestore.rules`, prefer using the emulator and run a quick smoke test via the client or `firebase emulators`.

- What to ask the maintainers before risky changes
  - Are usernames allowed to change to UIDs? (this affects `users` and all `members` keys)
  - Should Firestore rules be hardened now, or is permissive access intentional for an internal deployment?

If anything in these notes is unclear or you'd like more examples (API request/response samples, migration steps, or a small test harness), tell me which area and I will expand this file.
