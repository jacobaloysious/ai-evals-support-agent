# AI Evals: Northstar Shop support agent

A practical project for learning to build, measure, test, and improve an LLM-powered support agent. We will develop it lesson by lesson using the [AI Evals for Engineers & PMs syllabus](https://docs.google.com/document/d/1KSUlzN-C8z1q_gHduCi6eKgCzlHVV6u3dT0aypqi_YI/edit?tab=t.0) as a roadmap. This is our own learning implementation, not the instructors' course materials.

## The example

Northstar Shop is fictional. Customers can ask about orders, request eligible delivery address changes, and request shipping-fee refunds. The agent can read a customer's own order and change an eligible address. Every refund goes to a human reviewer. See [SPEC.md](SPEC.md) for the current policy and tool contracts.

## Try the Lesson 1 agent

Use Node.js 20 or newer:

```sh
npm test
npm run dev
```

Then open `http://localhost:4173`. The browser sandbox uses fictional Alice and Bob personas and a signed server session. The chat uses the OpenAI Agents SDK and server-side tools; set `OPENAI_API_KEY` in the server environment to enable model calls. The structured lesson controls work without it. This does not connect real authentication, orders, payments, or refunds. See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel setup and prototype limits.

## Progress

- [x] Lesson 1, step 1: define scope, roles, permissions, and acceptance examples in SPEC.md.
- [x] Lesson 1, step 2: build the agent, enforce tool permissions in code, and deploy a runnable sandbox.
- [x] Lesson 1, step 3: add an OpenAI Agents SDK conversational loop over the same server-enforced tools.
- [x] Lesson 2, step 1: add named, payload-redacted agent traces and correlate them with safe Vercel logs.
- [x] Lesson 3, step 1: add deterministic refund scenarios and a repeatable policy eval runner (`npm run eval:lesson3`).
- [ ] Lesson 3, step 2: run model-in-the-loop scenarios (`npm run eval:model`; requires a local `OPENAI_API_KEY`).
- [ ] Lessons 4–5: review traces, build a failure taxonomy, and validate evaluators.
- [ ] Lesson 6: add regression tests and a GitHub Actions gate.
- [ ] Lesson 7: red-team the agent and document governance controls.
- [ ] Lessons 8–9: improve accuracy and cost against held-out cases.

## How we will work

Each lesson adds a small, reviewable commit to this repository. We will define the behavior, build it, run a concrete example, inspect failures, and decide the next change together.
