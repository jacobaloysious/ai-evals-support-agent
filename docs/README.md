# Documentation index

## Get oriented

- [Project README](../README.md): install, run, learning path, and prototype limits.
- [Architecture and data flow](architecture.md): how browser requests, server tools, model traces, and evals connect.
- [Support-agent specification](../SPEC.md): policy, roles, tool contracts, and prototype boundary.
- [Deployment guide](../DEPLOYMENT.md): run locally, configure Vercel, and inspect traces.
- [Contributing and learning](../CONTRIBUTING.md): how to add policy tests, eval cases, and evidence.
- [Public-release checklist](public-release-checklist.md): remaining review and launch decisions.

## Lessons

1. [Specify the support problem](../SPEC.md)
2. [Inspect an agent run](../DEPLOYMENT.md#lesson-2-inspect-an-agent-run)
3. [Scenarios, evals, and traces](lesson3.md) · [Multi-turn evals](conversation-evals.md)
4. [Classify traces and failures](lesson4-5.md)
5. [Validate the grader](lesson4-5.md#lesson-5-test-the-evaluator-itself)
6. [Automated CI gate](../.github/workflows/ci.yml)
7. [Red-team the support agent](lesson7-red-team.md)
8. [Establish an eval baseline](lesson8-baseline.md)
9. [Improve accuracy and efficiency](lesson9-optimization.md)
10. [Compare model providers](lesson10-model-migration.md)

## Commands at a glance

Run from the repository root:

```sh
pnpm test
pnpm run eval:policy
pnpm run eval:model
pnpm run eval:conversation
pnpm run eval:compare
```

Only the first two commands are fully local and deterministic. Live model evals use API credits and may return variable wording. Set `MODEL_PROVIDER=openai` with `OPENAI_API_KEY`, or `MODEL_PROVIDER=meta` with `META_MODEL_API_KEY`, for single-provider evals. `eval:compare` needs both keys and writes a local report. CI runs tests and deterministic evals only.
