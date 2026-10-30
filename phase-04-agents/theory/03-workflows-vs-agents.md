# 3. Workflow patterns

**Time:** 20 min · **Visualization:** [`workflow-patterns.html`](../visualizations/workflow-patterns.html) · **Lab:** [`labs/02-workflow-patterns`](../labs/02-workflow-patterns)

## The idea
Most production "agents" are workflows. The five patterns from Anthropic's *Building effective agents*:

| Pattern | Shape | Use when |
|---|---|---|
| **Prompt chaining** | A → check → B → C | A task splits into fixed stages (outline → draft → translate) |
| **Routing** | classify → one of N specialised handlers | Inputs fall into distinct categories with different handling |
| **Parallelisation** | N calls at once → aggregate (sectioning or voting) | Independent subtasks, or you want several opinions |
| **Orchestrator-workers** | LLM plans subtasks → workers → synthesise | Subtasks can't be known in advance, but each is self-contained |
| **Evaluator-optimizer** | draft → critique → revise (capped) | Clear criteria exist and feedback measurably improves output |

The **agent** is the sixth shape: the model chooses every step.

## Web-engineering analogy
Routing is an **API gateway**. Parallelisation is **fan-out/fan-in** (`Promise.all` + reduce). Orchestrator-workers is a **job queue with a dynamic planner**. Evaluator-optimizer is a **CI loop**: build, test, fix, with a retry limit.

## Trade-offs
- Routing: one extra cheap call, a big quality gain when handlers differ, and misroutes are a new failure mode (measure them).
- Parallelisation: latency ≈ the slowest call (Lab 02: 312 ms vs ~900 ms), cost = the sum of calls.
- Evaluator-optimizer: 2–3× cost per round, and it may never converge (Lab 02 live: run 1 failed all 3 rounds, run 2 passed in round 3).

## ⚠️ Common mistakes
1. **An LLM to aggregate what code can.** Majority votes and merges are a `reduce`.
2. **Uncapped evaluator loops**, the most common infinite loop in LLM apps.
3. **Sequential awaits for independent calls.** Use `Promise.all`, and watch rate limits when you fan out.
4. **Reaching for orchestrator-workers when the subtasks are fixed.** If you can list them, write them down as a chain or a parallel block.

## Senior check
Given a feature, you can pick the simplest pattern that works and say what you'd measure to justify upgrading to an agent.
