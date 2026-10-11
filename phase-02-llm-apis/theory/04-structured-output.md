# 4. Structured output

**Time:** 20 min · **Visualization:** [`structured-output.html`](../visualizations/structured-output.html) · **Lab:** [`labs/04-structured-output`](../labs/04-structured-output)

## The idea
When code consumes the answer, ask for **data, not prose**. Three levels of strictness:

1. **Prompt-only JSON** ("respond in JSON"): works most of the time, and fails at scale (extra prose, trailing commas, wrong field names).
2. **JSON mode:** guarantees *valid JSON*, not *your* shape.
3. **Schema-constrained decoding** (OpenAI/Gemini structured outputs, Anthropic strict tool schemas, AI SDK `Output.object`): at each step the sampler **masks every token that would break the schema**, so the output is guaranteed to parse into your shape. That's Phase 1's sampling with a grammar filter applied before the draw.

You still **validate** (Zod) because constrained decoding guarantees syntax, not truth, and some providers fall back to best-effort.

### The schema is part of the prompt
Field names, enums and `.describe()` texts are sent to the model. `priority: enum(low|medium|high|urgent)` with a description defining each level beats any paragraph of instructions. `orderId: string | null` + "never invent one" stops fabricated ids (Lab 04's vague-email test).

## Web-engineering analogy
It's **request validation at an API boundary**, run on the model's response: a Zod schema on an untrusted payload. Constrained decoding is like a **typed RPC** (gRPC/tRPC) where malformed messages can't be serialized at all.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| `Output.object` with strict schema | Parseable, typed, safe to automate | Very deep or large schemas slow generation and may hit provider schema limits |
| `Output.choice` | Perfect for classification; no parsing | Single label only |
| Free text + parse | Most natural writing | Fragile; parsing code grows forever |
| Tool calling as structure | Works on older models; combines with actions | Semantically odd; more tokens |

## ⚠️ Common mistakes
1. **Trusting partial streamed objects.** They're unvalidated. Render them, but persist or act only on the final validated output.
2. **No nullability**, so the model must fill every field and invents data. Make unknowns `nullable()` and say so.
3. **Letting the model do arithmetic.** Extract numbers, compute totals in code (Lab 04: line items → `total` in TypeScript).
4. **No failure path.** `NoObjectGeneratedError` will happen. Retry once with the validation error as feedback (repair loop), then fail loudly with the raw text logged.
5. **Giant schemas for everything.** Split into steps (classify → extract the fields for that class) rather than one 60-field object.

## Senior check
You can explain why constrained decoding guarantees parseability but not correctness, design a schema whose descriptions do the prompting, and describe the repair path.
