# Lab 05: Tool calling, by hand and with the SDK (≈75 min)

**Concept:** [theory/05-tool-calling.md](../../theory/05-tool-calling.md) · **Visualization:** [tool-calling-loop.html](../../visualizations/tool-calling-loop.html) · **Key:** optional

## Task
The tools (`getOrderStatus`, `convertCurrency`) and their schemas are written for you. In `starter/index.ts`:
1. **`runManualToolLoop`**: the loop every agent framework hides. Call the model with tool *schemas* only, run the requested calls **yourself**, append `tool-result` messages, and call again until there's a final answer. Send errors back to the model as `error-text`, and cap the steps.
2. **`runSdkToolLoop`**: the same with `execute` functions + `stopWhen: isStepCount(5)`, and an `onStepEnd` trace.

## Run
```bash
npx tsx phase-02-llm-apis/labs/05-tool-calling/check.ts starter
```

## What to notice
- ⚠️ **The model never executes anything.** It emits JSON like `{"toolName":"getOrderStatus","input":{"orderId":"ORD-1001"}}`. Whether it runs, with which permissions and for which user, is decided by **your** code. Authorization lives there, not in the prompt.
- Live run: the 3-step loop used **928 input tokens**, because tool schemas and the growing history are resent on every step. Tools aren't free context.
- A thrown error becomes data the model can reason about ("I couldn't find ORD-404, can you double-check?") instead of a 500.
- The step cap isn't optional. A model that keeps calling tools forever is a real failure mode (Phase 4 covers more of them).
