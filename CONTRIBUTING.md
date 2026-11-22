# Contributing and learning with this repository

This repository is an educational prototype. Use only fictional test data; do not add real customer records, API keys, credentials, or production logs.

## A useful change loop

1. State the behavior you want to check and the trusted facts it depends on.
2. Add or update a deterministic test for policy, authorization, or state changes.
3. If the behavior depends on model interpretation or wording, add a model scenario and a response rubric.
4. Test the grader with both a valid response and a failure it should reject.
5. Run `pnpm test` and `pnpm run eval:policy`.
6. Run live model evals only when needed. They require `OPENAI_API_KEY`, make real API calls, may cost money, and may vary.
7. Describe the evidence: commands, results, and any limitation in the scenario coverage.

For policy changes, update `SPEC.md` and explain why the rule changed. For more context, follow the lessons in [docs/README.md](docs/README.md).
