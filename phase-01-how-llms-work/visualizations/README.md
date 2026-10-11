# Phase 1 visualizations

Single-file HTML pages: no build step, no server. Open them straight from disk (double-click, or `xdg-open <file>`). Everything works offline except the optional "embed your own sentence" box, which downloads the model once from a CDN.

| File | Concept | Try this |
|---|---|---|
| [tokenizer-playground.html](tokenizer-playground.html) | BPE tokenization | Press ▶ Play, then switch the preset to **Urdu** and **JSON with UUID** |
| [embedding-space.html](embedding-space.html) | Sentence embeddings, cosine similarity, projection distortion | Press **⚠️ Negation trap**, then click any dot and read the "x/5" distortion note |
| [attention-heatmap.html](attention-heatmap.html) | Q·K attention, heads, causal mask (toy model) | Switch heads; drag sharpness to 0.2; turn the causal mask off |
| [transformer-pipeline.html](transformer-pipeline.html) | The full inference pipeline, KV cache, training vs inference | Step through with → and toggle the **KV cache** on the last step |
| [context-window.html](context-window.html) | Stateless context budget, overflow strategies, quadratic cost | Press **+10 turns** four times, then change the overflow strategy |
| [sampling-lab.html](sampling-lab.html) | Temperature, top-k, top-p on real logits | **Chaos preset**, then top-p 0.9: thousands of tokens are still candidates |

## Real data
The embedding, sampling and pipeline pages embed **real outputs** from `all-MiniLM-L6-v2` and `SmolLM2-135M-Instruct`. Regenerate them (e.g. after changing the sentences or prompts) with:
```bash
npx tsx phase-01-how-llms-work/visualizations/_data/generate.ts
```
The script rewrites the `<script type="application/json" id="viz-data">` block in each page.
