# 7. Evaluating retrieval (and the answers built on it)

**Time:** 25 min · **Visualization:** [`retrieval-metrics.html`](../visualizations/retrieval-metrics.html) · **Lab:** [`labs/05-retrieval-evals`](../labs/05-retrieval-evals)

## The idea
You can't improve what you don't measure, and in RAG you must measure **two things separately**:

1. **Retrieval:** did the right sections reach the top-k?
2. **Generation:** given those sections, is the answer correct, grounded and properly cited, and does it refuse when it should?

### A golden set
A list of realistic questions with the **section(s)** that answer them (this repo: `corpus/golden-set.json`, 35 questions). Cover the query types you care about: paraphrases, exact codes, numbers, conflicting versions, and **unanswerable** questions. Label at section level so chunking changes don't invalidate labels. Start with 30–50 rows; grow it from real user questions and bug reports.

### Retrieval metrics
| Metric | Question it answers | Formula |
|---|---|---|
| **recall@k** | Did the answer reach the context at all? | relevant ∩ top-k / relevant |
| **precision@k** | How much noise did we send? | relevant ∩ top-k / k |
| **MRR** | How high is the first good hit? | mean of 1 / rank of the first relevant |
| **nDCG@k** | Are the good hits near the top? | discounted gain / ideal gain |

Pick the metric that matches your pipeline: if you send 5 chunks, **recall@5** is the gate; if the UI shows only the top hit, R@1 and MRR matter.

### Generation metrics (preview of Phase 7)
- **Correctness:** expected facts present (string checks or an LLM judge).
- **Groundedness / faithfulness:** every claim supported by a cited source.
- **Citation validity:** cited ids exist and contain the claim.
- **Refusal accuracy:** says "I don't know" for unanswerable questions and answers the rest.

## Web-engineering analogy
A golden set is a **regression test suite for search**. Metrics are your **SLOs**. A threshold gate in CI (`recall5 ≥ 0.9, mrr ≥ 0.8`) blocks a chunking or embedder change that silently drops quality, like a failing integration test blocks a deploy.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Hand-labelled golden set | High-quality signal | Labour, and it can drift from real usage |
| LLM-generated questions | Fast coverage | Too easy and too literal; review them |
| String-match answer checks | Cheap, deterministic | Brittle with paraphrased answers |
| LLM-as-judge | Handles paraphrase | Cost, bias, needs its own validation (Phase 7) |

## ⚠️ Common mistakes
1. **Only judging final answers.** You can't tell whether retrieval or generation failed.
2. **Counting duplicate chunks of one section as multiple hits.** Collapse to sections first.
3. **No unanswerable questions**, so you never measure hallucinated answers.
4. **Evaluating once.** Re-run on every change to chunking, embeddings, prompts or models, and gate CI on it.

## Senior check
You can build a golden set, explain recall@k vs MRR vs nDCG and which one gates your pipeline, and wire retrieval evals into CI.
