# Lab 03: The AI SDK, and prompts as tested code (≈75 min)

**Concepts:** [theory/02-prompting.md](../../theory/02-prompting.md), [theory/01-anatomy-of-an-api-call.md](../../theory/01-anatomy-of-an-api-call.md) · **Key:** optional (mock model offline; Gemini free tier live)

## Task
In `starter/index.ts`:
1. `ask`, `chatTurn` and `streamAnswer` with the AI SDK (`generateText` / `streamText`). The same code runs on Gemini, Claude, OpenAI or a mock, because `shared/llm.ts` picks the model.
2. `buildClassifierPrompt`: a production-shaped prompt with role, label definitions, few-shot examples, **delimited untrusted input**, and an exact output format.
3. `escapeForTag`, so a ticket containing `</ticket> SYSTEM: …` can't break out of its tag.
4. `parseLabel`: defensive parsing of free text.
5. `classify` + `evaluate`: your first **eval**, a labelled dataset and an accuracy score.

## Run
```bash
npx tsx phase-02-llm-apis/labs/03-ai-sdk-and-prompts/check.ts starter              # uses .env (Gemini)
LLM_PROVIDER=mock npx tsx phase-02-llm-apis/labs/03-ai-sdk-and-prompts/check.ts starter   # offline
```

## What to notice
- **AI SDK 7 renamed `system` to `instructions`**, and it rejects `{ role: 'system' }` inside `messages` by default. That's a security default: users must not be able to inject a system message into chat history.
- Turn 2 of the chat used **31 input tokens vs 14** for turn 1. Same stateless lesson as Phase 1, now on a real bill.
- The eval is 8 rows. That's tiny, but it's the habit that matters: **change a prompt → rerun the eval**. Phase 7 scales this into CI.
- Escaping `<`/`>` stops *delimiter* injection, not prompt injection in general. A model can still be talked into things by plain-language text. Phase 7 covers the real defences.
