# AI Evals: Northstar Shop support agent

A practical project for learning to build, measure, test, and improve an LLM-powered support agent. We will develop it lesson by lesson using the [AI Evals for Engineers & PMs syllabus](https://docs.google.com/document/d/1KSUlzN-C8z1q_gHduCi6eKgCzlHVV6u3dT0aypqi_YI/edit?tab=t.0) as a roadmap. This is our own learning implementation, not the instructors' course materials.

## The example

Northstar Shop is fictional. Customers can ask about orders, request eligible delivery address changes, and request shipping-fee refunds. The agent can read a customer's own order and change an eligible address. Every refund goes to a human reviewer. See [SPEC.md](SPEC.md) for the current policy and tool contracts.

## Progress

- [x] Lesson 1, step 1: define scope, roles, permissions, and acceptance examples in SPEC.md.
- [ ] Lesson 1, step 2: build the agent and enforce tool permissions in code.
- [ ] Lesson 2: add structured traces and observability.
- [ ] Lesson 3: create a deterministic commerce world and synthetic scenarios.
- [ ] Lessons 4–5: review traces, build a failure taxonomy, and validate evaluators.
- [ ] Lesson 6: add regression tests and a GitHub Actions gate.
- [ ] Lesson 7: red-team the agent and document governance controls.
- [ ] Lessons 8–9: improve accuracy and cost against held-out cases.

## How we will work

Each lesson adds a small, reviewable commit to this repository. We will define the behavior, build it, run a concrete example, inspect failures, and decide the next change together. The first learner decisions are listed at the end of SPEC.md.

Vercel deployment comes after there is a working local agent and a basic regression suite. No live store or payment system is connected to this project.
