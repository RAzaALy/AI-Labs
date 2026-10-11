# 5. Sampling: temperature, top-k, top-p

**Time:** 15 min · **Visualization:** [`sampling-lab.html`](../visualizations/sampling-lab.html) · **Lab:** [`labs/03-sampling`](../labs/03-sampling)

## The idea
At each step the model outputs **logits**, one raw score per vocabulary token. Turning logits into an actual next token is **sampling**, and it happens *outside* the network, in a few lines of code you'll write yourself in the lab:

1. **Temperature:** divide logits by T. T < 1 sharpens the distribution (more predictable). T > 1 flattens it (more random). **T → 0 means greedy**: always pick the argmax.
2. **Softmax:** `p_i = exp(z_i) / Σ exp(z_j)` turns scores into probabilities.
3. **Top-k:** keep only the k most likely tokens.
4. **Top-p (nucleus):** keep the smallest set of tokens whose probabilities sum to ≥ p.
5. Renormalize and draw one token at random. Append it, and run the model again.

## Web-engineering analogy
The model gives you a **ranked result set with scores**. Sampling is your **load-balancing policy** over that set. Greedy is "always route to the top server". Temperature is how much you spread traffic across the others. Top-k/top-p are **health checks** that drop the long tail of bad candidates before you pick.

## Trade-offs
| Setting | Good for | Risk |
|---|---|---|
| Low T (0–0.3) | Extraction, classification, code, structured output | Repetitive; can loop; still not guaranteed deterministic |
| Medium T (0.5–0.8) | Chat, writing | Occasional odd choices |
| High T (>1) | Brainstorming variety | Incoherence, made-up facts |
| top-p 0.9–0.95 | Cuts nonsense tail while keeping variety | Interacts with T: tune one, not both |

## ⚠️ Common mistakes (one of the four big ones)
1. **"Temperature 0 makes it deterministic."** It makes the *sampling step* greedy. Outputs can still vary between calls because of batched GPU floating-point math, MoE routing and silent model updates. **Design for nondeterminism:** validate outputs, use structured output, write evals that tolerate paraphrase.
2. **"Temperature 0 makes it correct."** Greedy picks the most *likely* token, not the true one. A hallucination at T=0 is just a confident hallucination.
3. **Tuning temperature and top-p together.** They interact. Change one and keep the other at its default. Providers often recommend this explicitly.
4. **Assuming every model accepts these knobs.** Some reasoning/"thinking" models restrict or ignore sampling parameters. Check the provider docs for your model before relying on them.

## A nondeterminism you can reproduce on your laptop
While building this phase, the **q8-quantized** SmolLM2 gave `" Paris"` **70%** after `"The capital of France is"` when that was the whole input, but **34%** for the *exact same prefix* when the input continued with `" Paris."`. With causal attention the earlier positions should not depend on later tokens. They didn't in fp32, where both cases gave 46.9%. The q8 export uses **dynamic activation quantization**: scales are computed over the whole input tensor, so later tokens shift the rounding of earlier ones.

Production servers have the same class of problem at a larger scale: your request is batched with other people's, kernels and quantization pick different paths for different batch shapes, and logits shift slightly. That is a big reason "temperature 0" still varies between calls. **Engineering takeaway:** never build features that assume byte-identical outputs. Validate structure, compare semantically, and pin model versions.

## Senior check
You can implement sampling from a logits array in ~20 lines, explain why T=0 is neither deterministic nor "correct", and choose settings for extraction vs creative tasks.
