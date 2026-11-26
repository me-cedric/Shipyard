---
description: "React rules of Shipyard: feature layout, generated IPC, TanStack Query, tokens, i18n and tests. Applies when you edit web TypeScript or TSX."
paths:
  - "**/*.tsx"
  - "**/features/**/*.ts"
  - "**/routes/**/*.ts"
  - "**/*ViewModel*.ts"
  - "**/vite.config.*"
  - "**/next.config.*"
  - "**/theme.ts"
stacks: [react-web, next-web]
---
# React rules

## Structure
- Put each feature in `src/features/<space>/`. Share components only through `src/ui/`, in its atomic layers.
- Call the backend through the generated `src/lib/ipc/bindings.ts`. Never edit it by hand. Update the hand-written mocks `src/lib/ipc/mock*.ts` with each command change.
- Use the alias `@/` for `src/`.

## Data
- Read and write with TanStack Query over the IPC commands. Use array query keys. Invalidate the related queries after a mutation.

## UI
- Use Tailwind with the design tokens. Do not hard-code a colour.
- Put each text in the typed i18n objects of `src/lib/i18n`, with the same key in English, French, German and Spanish.
- Make each control 44 px or more. Keep the accessible name of each control.
- Allow only `http` and `https` in a user-supplied `href`.

## Tests
- Test with Vitest and Testing Library, beside the file. Use Playwright for the end-to-end flows.
- Before you finish, run `pnpm lint`, `pnpm typecheck` and the scoped `pnpm vitest run <path>`.
