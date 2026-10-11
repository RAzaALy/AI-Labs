# 6. Training vs inference

**Time:** 20 min · **Visualization:** [`transformer-pipeline.html`](../visualizations/transformer-pipeline.html) (tab "Training vs inference")

## The idea
**Training** adjusts the model's weights. **Inference** runs the frozen weights to produce output. As an application engineer you will almost only do inference, but you need to know where a model's behaviour comes from.

| Stage | What happens | Data | Result |
|---|---|---|---|
| **Pre-training** | Predict the next token over trillions of tokens; weights updated by gradient descent | Web, books, code | A "base model": a superb autocomplete with no manners |
| **Post-training: SFT** | Supervised fine-tuning on example conversations | Curated prompt→ideal-response pairs | Follows instructions, uses chat format |
| **Post-training: preference / RL** | RLHF/RLAIF: reward preferred answers. RL on verifiable tasks (math, code) | Human/AI preferences, checkable problems | Helpful, safer; **reasoning models** learn to "think" before answering |
| **Inference** | Forward pass only, token by token | Your prompt | Output. **Weights never change.** |

## Web-engineering analogy
- **Training = the build pipeline.** Extremely expensive, runs offline, and produces an immutable artifact (the weights file).
- **Inference = running the binary in production.** Cheap per request, scales horizontally, the artifact is read-only.
- **Fine-tuning = a patch build** on top of the base artifact (Phase 6).
- **Prompting / in-context learning = runtime config.** You change behaviour per request without rebuilding. It disappears after the request.
- **Knowledge cutoff = the build date.** The binary only knows what was in the repo when it was built, so you supply fresh data at runtime (RAG, tools).

## Why models hallucinate
Pre-training rewards *plausible continuation*, not truth. When the weights lack a fact, the most plausible continuation is still a fluent, confident-sounding answer. Post-training reduces this but can't eliminate it. **Mitigations are architectural:** ground the model in retrieved sources (Phase 3), give it tools (Phase 2/4), require citations, and evaluate (Phase 7).

## Where inference cost and latency come from
- **Prefill** (processing your prompt) is parallel and compute-bound. It drives **time to first token**.
- **Decode** (generating) is sequential and memory-bandwidth-bound. It drives **tokens/second**, so total latency ≈ TTFT + output_tokens / speed.
- **Reasoning tokens** are output tokens. A "thinking" model can produce thousands of hidden tokens that you pay for and wait for. Effort/budget controls trade quality against cost and latency.

## Trade-offs: how to change model behaviour (cheapest first)
1. **Prompting:** instant, free to iterate. Limited by context and model ability.
2. **Retrieval / tools:** fresh, private, citable knowledge. Needs infra (Phases 3–5).
3. **Fine-tuning:** teaches style, format or narrow skills. Costly to iterate, needs data and evals, **does not reliably add facts** (Phase 6).
4. **Pre-training your own model:** almost never the right call for a product team.

## ⚠️ Common mistakes
1. **"The model will learn from our users' chats."** Not at inference time. Any "learning" is your app storing data and putting it back into context.
2. **Reaching for fine-tuning to add knowledge.** Use retrieval for facts and fine-tuning for behaviour/format. Most teams never need fine-tuning.
3. **Ignoring the knowledge cutoff.** Ask a model about a library released after its cutoff and it will confidently invent an API. Provide the docs in context.

## Senior check
You can explain base vs instruction-tuned vs reasoning models, why hallucination is a property of the training objective, and the order in which you'd try prompting, RAG and fine-tuning.
