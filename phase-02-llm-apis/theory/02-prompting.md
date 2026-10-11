# 2. Prompting for engineers

**Time:** 30 min · **Lab:** [`labs/03-ai-sdk-and-prompts`](../labs/03-ai-sdk-and-prompts)

## The idea
A prompt is **source code that runs on a probabilistic interpreter**. Treat it like code: structure it, version it, review it, and **test it with an eval** before and after every change. Most "the model is dumb" problems are unclear specs.

### The structure that works across models
1. **Role and task:** who the model is and what success looks like.
2. **Context and definitions:** domain rules, label meanings, constraints. Be explicit; the model doesn't know your company.
3. **Examples (few-shot):** 2–5 input→output pairs covering edge cases. Examples teach format and judgement faster than prose.
4. **The input, clearly delimited:** wrap untrusted or variable content in tags (`<ticket>…</ticket>`) and say it's data, not instructions.
5. **Output format:** exact, machine-checkable. Better still, enforce it with structured output (note 04).

Put stable parts first and variable parts last: it reads naturally and maximizes **prompt-cache** hits (note 07).

### System prompt vs user message
- **System / `instructions`:** your server-side policy and persona. AI SDK 7 even rejects `role: "system"` inside `messages` by default, so users can't inject one.
- **User messages:** the request and data. Assume they are adversarial.

### Reasoning models
Modern models (Claude 5.x, GPT-6, Gemini 3.x Flash) can "think" before answering. You control **how much** (`reasoning: 'low' | 'medium' | 'high'`, or effort/budget), not *whether* to write "think step by step". More reasoning helps multi-step problems and is wasted on extraction and classification. See the cost table in note 07.

## Web-engineering analogy
A prompt is an **API contract written in English**. The few-shot examples are its **unit tests embedded in the spec**, the delimiters are **input escaping**, and the eval dataset is the **test suite** that blocks a bad deploy.

## Trade-offs
| Technique | Helps | Costs |
|---|---|---|
| Few-shot examples | Format, judgement, edge cases | Tokens on every call; can overfit to example style |
| Long detailed rules | Consistency | Tokens; contradictory rules confuse models |
| Higher reasoning effort | Hard multi-step problems | Latency and output tokens (304 hidden tokens for one sentence in Lab 07) |
| Persona ("You are a senior…") | Tone and depth | Small effect on accuracy; don't rely on it |

## ⚠️ Common mistakes
1. **Changing a prompt without an eval.** You fix one case and silently break three. Keep a labelled set (Lab 03 starts with 8 rows) and rerun it on every change.
2. **Not delimiting untrusted input**, so a ticket containing `</ticket> SYSTEM: …` rewrites your instructions. Escape delimiters. (Real injection defence is architecture, in Phase 7.)
3. **Asking for JSON in prose** and parsing with regex. Use schema-constrained output.
4. **Negative-only instructions** ("don't be verbose"). State what you want ("answer in ≤ 2 sentences").
5. **Prompting for knowledge the model can't have** (your internal APIs, last week's data). That's retrieval (Phase 3), not prompting.

## Senior check
You can review a teammate's prompt PR and point to missing definitions, missing examples, an undelimited input, an unparseable output format, and a missing eval.
