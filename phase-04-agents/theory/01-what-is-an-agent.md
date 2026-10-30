# 1. What an agent is, and when not to build one

**Time:** 20 min · **Visualization:** [`workflow-patterns.html`](../visualizations/workflow-patterns.html)

## The idea
An **agent** is an LLM running tools in a loop, where the **model decides the next step** from what the previous steps returned, until it judges the goal met (or a limit stops it). Everything else is a **workflow**: LLM calls on a path *your code* defines (Phase 2's tool loop with a fixed task, Phase 3's retrieve-then-answer).

```
workflow:  input → [LLM] → [code] → [LLM] → output         (you know the path, the cost, the latency)
agent:     goal  → [LLM ⇄ tools]* → stop condition → result  (the model chooses the path; you set the limits)
```

The building block of both is the **augmented LLM**: a model plus tools, retrieval and memory. Agents earn their cost when the steps really can't be known in advance: investigating an incident, resolving a support case that needs different lookups each time, or working through a codebase.

## Web-engineering analogy
A workflow is a **request handler**: a fixed sequence of calls. An agent is a **job runner with a planner**: it decides at run time which handlers to call next, so you need the things you'd add to any job system: timeouts, retry limits, budgets, audit logs and a kill switch.

## Trade-offs
| | Workflow | Agent |
|---|---|---|
| Path | Fixed by code | Chosen by the model |
| Cost / latency | Known, bounded | Variable; grows with steps × context |
| Reliability | Testable like normal code | Needs repeated-trial evals (pass^k) |
| Handles the unexpected | Poorly | Well, within its tools |
| Debugging | Stack traces | Traces of model decisions |

## ⚠️ Common mistakes
1. **"Agent" as the default architecture.** Start with one LLM call, then a workflow. Add autonomy only when a measured failure needs it.
2. **Equating "uses tools" with "agent".** A fixed lookup-then-answer is a workflow, and that's a compliment.
3. **Letting the model enforce business rules.** Rules live in tool code (Lab 01's environment refuses a refund on a 42-day-old invoice, whatever the model says).
4. **No exit.** Every agent needs several stop conditions: done, step cap, token budget, wall-clock timeout.

## Senior check
You can say for a given feature whether it needs an agent, a workflow or a single call, and defend the choice with cost, latency and reliability.
