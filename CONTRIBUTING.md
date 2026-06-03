# Contributing

BreakGlass is a personal Windows desktop IT reference tool. Contributions should keep the app local-first, single-user, and focused on fast retrieval under pressure.

## Local setup

```bash
npm install
npm run tauri dev
```

## Verification

Run these before committing app changes:

```bash
npm exec tsc -- --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
```

## Development notes

- Keep UI changes consistent with the compact desktop-tool layout.
- Do not add hosted services, multi-user workflows, or ticketing concepts unless the product direction changes.
- Keep generated data, local prep folders, secrets, and real operational data out of Git.
- Prefer focused commits with clear messages.

## Pull requests

Include a short summary, the verification commands run, and any known risks or follow-up work.
