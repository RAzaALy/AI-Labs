# 7. Evaluating agents

**Time:** 20 min · **Visualization:** [`pass-k.html`](../visualizations/pass-k.html) · **Lab:** [`labs/06-agent-evals`](../labs/06-agent-evals)

## The idea
Agents are non-deterministic programs with side effects, so evaluate them like that:

- **Outcome grading.** Run each task against a fresh, seeded environment and check the **final state**: was the right invoice refunded, exactly once? Is api healthy and web untouched? Words are a weak signal; state is ground truth.
- **Trajectory checks.** Rules on *how* it got there: looked up before acting, ≤ N calls, never called X, asked for approval.
- **Repeated trials.** Run each task k times. **pass@k** = at least one of k succeeds (fine for "try until it works" settings). **pass^k** = *all* k succeed (what matters when every customer gets one attempt). τ-bench reported pass^8 under 25% for strong models on retail tasks.
- **Track cost and steps** next to success. A fix that doubles steps is a regression too.
- **Include traps**: tasks where the tempting action is wrong (refunding a 42-day-old charge by setting `billingError`).

LLM-as-judge is useful for fuzzy qualities (tone, helpfulness), but validate it against human labels first, and never use it for what a state check can verify.

## Web-engineering analogy
**End-to-end tests against a seeded test database**, run repeatedly to catch **flaky tests**. Except here the flakiness is the product's behaviour, so you measure it rather than retry it away.

## What Lab 06 measured
`gemini-3.5-flash-lite`, 5 tasks × 3 trials: run 1 **15/15**, run 2 **14/15** (once it rolled back the api but skipped the required review ticket), so mean pass^3 went **1.00 → 0.80** on identical code.

## ⚠️ Common mistakes
1. **One run per task.** You're measuring luck.
2. **Grading the final message.** "I've refunded it" with no refund in the database passes a text grader.
3. **Shared, mutable test environments.** Every trial needs a fresh world, or trials contaminate each other.
4. **Ignoring rate limits.** Suites fire many calls quickly (Lab 06's first live run died on a 15 requests/minute limit). Pace them.

## Senior check
You can design a 10-task agent eval with outcome graders, trajectory rules and traps, report pass^k with cost, and explain why pass@1 overstates reliability.
