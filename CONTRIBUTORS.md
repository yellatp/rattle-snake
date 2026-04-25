# Contributors

Rattle-Snake is open source and built with community contributions. Everyone who improves the tool — code, prompts, docs, bug reports — is a contributor.

---

## Core Author

| Name | Role | Links |
| :--- | :--- | :---- |
| **Pavan Yellathakota** | Creator & Maintainer | [GitHub](https://github.com/yellatp) · [LinkedIn](https://linkedin.com/in/yellatp) · [Portfolio](https://pye.pages.dev) |

---

## How to Contribute

### Adding a new AI provider

1. Create `src/lib/ai/providers/<name>.ts` — export `call<Name>` and `stream<Name>` (see `openai.ts` for the pattern)
2. Add the provider to `AIProvider` union in `src/store/app.ts`
3. Add default model config to `DEFAULT_PROVIDERS`
4. Add routing in `src/lib/ai/router.ts` (`routeCall` and `routeStream` switch statements)
5. Add a `ProviderDef` entry in `src/components/Settings.tsx`
6. Test with a real API key before opening a PR

### Adding a new role template

1. Add a JSON file to `src/templates/<role>.json` — follow the existing schema (`contact`, `sections.summary`, `sections.skills`, `sections.experience`, etc.)
2. Create a system prompt at `src/lib/ai/prompts/<role>.ts`
3. Register both in `src/components/AIGeneratePanel.tsx` (`PROMPT_MAP` + `SYSTEM_TEMPLATES`)

### Bug reports & feature requests

Use the GitHub issue templates:
- **Bug:** `.github/ISSUE_TEMPLATE/bug_report.yml`
- **Feature:** `.github/ISSUE_TEMPLATE/feature_request.yml`

### Code style

- TypeScript everywhere — no `any` unless unavoidable
- No server-side code — this is a 100% browser app
- Never log, transmit, or store API keys outside of `keyStore`
- Follow the existing Tailwind + Zustand patterns

---

## Built in Association With

| Project | Link |
| :------ | :--- |
| **OnlyNerds** | [onlynerds.win](https://onlynerds.win) |
| **Alphonso AI** | [alphonso.app](https://alphonso.app) |

---

## License

Apache 2.0 — see [LICENSE](./LICENSE)
