# Glossary

Short definitions, with a web-engineering analogy where one helps. The phase where each term is taught is in brackets. Terms are added as phases are published.

| Term | Meaning | Web analogy / note |
|---|---|---|
| **Agent** [4] | An LLM in a loop that chooses tools, observes results, and decides the next step until a goal or stop condition. | An event loop with a planner deciding the next handler |
| **Attention** [1] | Mechanism where each token computes a weighted blend of earlier tokens' values, weighted by query·key match. | A soft key-value lookup / a fuzzy join |
| **Attention sink** [1] | Heads that park weight on the first token when nothing else is relevant (softmax must sum to 1). | |
| **Autoregressive** [1] | Generating one token at a time, feeding each output back as input. | A loop where each response becomes part of the next request |
| **Base model** [1] | A model after pre-training only: strong autocomplete, doesn't follow instructions. | |
| **BPE (byte-pair encoding)** [1] | Tokenizer algorithm that repeatedly merges the most frequent adjacent pair of symbols. | A compression codec with a fixed learned dictionary |
| **Causal mask** [1] | Prevents tokens from attending to later tokens, so generation stays left-to-right. | |
| **Chat template** [1] | The string format (with special tokens like `<\|im_start\|>`) that a messages array is rendered into. | Serialization of a structured request into the wire format |
| **Chunking** [3] | Splitting documents into retrievable pieces before embedding. | Choosing the granularity of index entries |
| **Context rot / lost in the middle** [1] | Quality drops as context grows; facts in the middle of long prompts are recalled worst. | |
| **Context window** [1] | Max tokens per request, input + output combined. | Request payload budget, response included |
| **Cosine similarity** [1] | Angle-based similarity of two vectors, −1…1; equals the dot product for unit vectors. | |
| **Cross-entropy loss** [1] | Training objective: −ln p(correct next token), averaged over positions. | |
| **Decode** [1] | The sequential, token-by-token generation phase; memory-bandwidth bound. Drives tokens/s. | |
| **Embedding (sentence)** [1] | Fixed-length vector representing a text's meaning, from an embedding model. | An index key for meaning |
| **Embedding (token)** [1] | The learned vector for each vocabulary id inside an LLM (first layer). | A foreign-key lookup into a table of vectors |
| **Entropy** [1] | Uncertainty of a distribution in bits; 2^H ≈ number of "effective choices". | |
| **Eval** [7] | A repeatable test that scores model/system outputs against expectations. | Tests for nondeterministic code |
| **Fine-tuning / LoRA** [6] | Further training on your data. LoRA trains small adapter matrices instead of all weights. | A patch build on top of a release artifact |
| **Greedy decoding** [1] | Always pick the most probable token (T=0). | |
| **Hallucination** [1] | Fluent, confident output not supported by facts or sources: a consequence of the training objective. | |
| **Hybrid search** [3] | Combining keyword (BM25/full-text) and vector search, often fused with RRF. | |
| **Inference** [1] | Running a trained model to produce outputs; weights frozen. | Running the binary in production |
| **KV cache** [1] | Stored keys/values of processed tokens so each new token doesn't recompute the prefix. | Memoisation |
| **Logits** [1] | Raw, unnormalized scores over the vocabulary for the next token. | Ranked search results with scores |
| **MCP (Model Context Protocol)** [5] | Open protocol for exposing tools, resources and prompts to AI hosts. | LSP for AI tools / a USB-C port for context |
| **Mixture of Experts (MoE)** [1] | Architecture where only some "expert" sub-networks run per token. | Routing requests to a subset of services |
| **MLP / feed-forward** [1] | Per-token sub-network in each transformer block; much of the stored knowledge lives here. | |
| **Post-training** [1] | SFT + preference/RL stages that turn a base model into an assistant. | |
| **Prefill** [1] | Processing the whole prompt in parallel before the first output token. Drives TTFT. | |
| **Pre-training** [1] | Next-token prediction over a huge corpus; produces the base model. | The expensive build step |
| **Prompt caching** [2] | Provider-side reuse of a previously processed prompt prefix at a discount. | A CDN cache for the prefix of your request |
| **Prompt injection** [7] | Untrusted content containing instructions that the model follows. | Like SQL injection, but no reliable escaping exists |
| **Quantization** [1, 6] | Storing or computing weights/activations at lower precision (int8, 4-bit) to save memory and time, at some accuracy cost. | Lossy compression |
| **RAG (retrieval-augmented generation)** [3] | Retrieve relevant documents and put them in the prompt so the model answers from them. | Server-side includes of fresh data at request time |
| **Reasoning / thinking tokens** [1, 2] | Hidden output tokens a reasoning model generates before answering; billed as output. | |
| **Reranker** [3] | A slower, more accurate model that re-scores retrieved candidates. | A second-stage sort after a coarse index scan |
| **Residual stream** [1] | The running per-token vector each block adds its output onto. | A request context object enriched by middleware |
| **RoPE** [1] | Rotary position embeddings: encode position by rotating query/key vectors. | |
| **Sampling** [1] | Turning a probability distribution into one chosen token (temperature, top-k, top-p). | A load-balancing policy over ranked candidates |
| **SFT** [1] | Supervised fine-tuning on example conversations; teaches instruction following. | |
| **Softmax** [1] | Turns scores into probabilities that sum to 1: exp(zᵢ)/Σexp(zⱼ). | |
| **Stateless (API)** [1] | Each request is independent; history exists only if you resend it. | REST with no server session |
| **Structured output** [2] | Constraining the model to emit JSON matching a schema. | Response validation with a schema |
| **System prompt** [2] | Top-priority instructions that frame the model's behaviour for a request. | Server-side config injected into every request |
| **Teacher forcing** [1] | Training trick: predict every next token in parallel, given the true previous tokens. | |
| **Temperature** [1] | Divides logits before softmax: <1 sharpens, >1 flattens, 0 = greedy. | |
| **Token** [1] | The unit an LLM reads/writes: a subword piece with an integer id. | |
| **Tool / function calling** [2] | The model emits a structured request to call a function; **your code** executes it and returns the result. | An RPC request the model asks you to make |
| **Top-k / top-p (nucleus)** [1] | Keep the k most likely tokens, or the smallest set whose cumulative probability ≥ p, before sampling. | Health checks that drop bad candidates |
| **Transformer** [1] | Architecture of stacked blocks (attention + MLP + residuals). | A middleware pipeline |
| **TTFT** [1, 7] | Time to first token: prefill + queueing latency. | Time to first byte |
| **Vector database** [3] | Storage + approximate nearest-neighbour index over embeddings (e.g. pgvector HNSW). | An index optimised for "nearest", not "equal" |
