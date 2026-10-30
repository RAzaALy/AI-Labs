# Glossary

Short definitions, with a web-engineering analogy where one helps. The phase where each term is taught is in brackets. Terms are added as phases are published.

| Term | Meaning | Web analogy / note |
|---|---|---|
| **Agent** [4] | An LLM in a loop that chooses tools, observes results, and decides the next step until a goal or stop condition. | An event loop with a planner deciding the next handler |
| **Agent-computer interface (ACI)** [4] | The tools as the model sees them: names, descriptions, schemas, outputs and errors. Designed for the task, not the database. | API design for a client that only reads your OpenAPI spec |
| **ANN (approximate nearest neighbour)** [3] | Finding *almost* the closest vectors fast by searching an index (e.g. HNSW) instead of comparing against every vector. Trades a little recall for big speed-ups. | A cache that is usually right; measure how often (recall vs exact search) |
| **Attention** [1] | Mechanism where each token computes a weighted blend of earlier tokens' values, weighted by query·key match. | A soft key-value lookup / a fuzzy join |
| **Attention sink** [1] | Heads that park weight on the first token when nothing else is relevant (softmax must sum to 1). | |
| **Autoregressive** [1] | Generating one token at a time, feeding each output back as input. | A loop where each response becomes part of the next request |
| **Base model** [1] | A model after pre-training only: strong autocomplete, doesn't follow instructions. | |
| **Batch API** [2] | Asynchronous bulk requests at ~50% off, results within hours. | A job queue instead of a synchronous call |
| **Bi-encoder vs cross-encoder** [3] | A bi-encoder embeds query and document separately (fast, precomputable: vector search). A cross-encoder reads them together and scores the pair (slower, more accurate: reranking). | Pre-built index lookup vs a full comparison per candidate |
| **BPE (byte-pair encoding)** [1] | Tokenizer algorithm that repeatedly merges the most frequent adjacent pair of symbols. | A compression codec with a fixed learned dictionary |
| **Causal mask** [1] | Prevents tokens from attending to later tokens, so generation stays left-to-right. | |
| **Chat template** [1] | The string format (with special tokens like `<\|im_start\|>`) that a messages array is rendered into. | Serialization of a structured request into the wire format |
| **Chunking** [3] | Splitting documents into retrievable pieces before embedding. | Choosing the granularity of index entries |
| **Citation validation** [3] | Checking after generation that every cited source number exists and that a factual answer cites something; problems are flagged, not hidden. | Server-side validation of client input, applied to model output |
| **Compaction / tool-result clearing** [4] | Shrinking an agent's history: replace old tool outputs with placeholders, or summarise older turns, so each step re-sends less. | Pagination + cache instead of sending the whole history every request |
| **Constrained decoding** [2] | Sampling where tokens that would violate a schema/grammar are masked, guaranteeing parseable output. | A typed RPC that cannot serialize an invalid message |
| **Context rot / lost in the middle** [1] | Quality drops as context grows; facts in the middle of long prompts are recalled worst. | |
| **Context window** [1] | Max tokens per request, input + output combined. | Request payload budget, response included |
| **Cosine similarity** [1] | Angle-based similarity of two vectors, −1…1; equals the dot product for unit vectors. | |
| **Cross-entropy loss** [1] | Training objective: −ln p(correct next token), averaged over positions. | |
| **Decode** [1] | The sequential, token-by-token generation phase; memory-bandwidth bound. Drives tokens/s. | |
| **DNS rebinding** [5] | A web page makes its own hostname resolve to 127.0.0.1 and calls your local server from the victim's browser. Defense: validate `Host`/`Origin`, bind loopback, require auth. | Why dev servers check the Host header |
| **Elicitation** [5] | A server asking the user (through the host) for input or confirmation, as a form or a URL to visit. Answered by the host, never the model. | A confirm dialog the backend requests |
| **Embedding (sentence)** [1] | Fixed-length vector representing a text's meaning, from an embedding model. | An index key for meaning |
| **Embedding (token)** [1] | The learned vector for each vocabulary id inside an LLM (first layer). | A foreign-key lookup into a table of vectors |
| **Entropy** [1] | Uncertainty of a distribution in bits; 2^H ≈ number of "effective choices". | |
| **Eval** [7] | A repeatable test that scores model/system outputs against expectations. | Tests for nondeterministic code |
| **Evaluator-optimizer** [4] | Workflow: one call drafts, another critiques against criteria, the first revises, up to a capped number of rounds. | A CI loop: build → test → fix, with a retry limit |
| **Explicit vs implicit caching** [2] | Explicit: you mark cacheable prefixes (guaranteed within TTL, write premium). Implicit: provider caches automatically (best-effort). | Cache-Control you set vs a CDN's heuristic caching |
| **Few-shot prompting** [2] | Including worked input→output examples in the prompt. | Unit tests embedded in the spec |
| **Fine-tuning / LoRA** [6] | Further training on your data. LoRA trains small adapter matrices instead of all weights. | A patch build on top of a release artifact |
| **Finish reason** [2] | Why generation stopped: `stop`, `length` (truncated), `tool-calls`, `content-filter`. | The status code of the generation, so check it |
| **Full jitter** [2] | Retry delay = random(0, base·2ⁿ); de-synchronizes clients after errors. | Prevents a thundering herd |
| **Golden set** [3] | A fixed, labelled list of questions with the relevant sources (and expected facts) used to score retrieval and answers on every change. | A regression test suite for search quality |
| **Greedy decoding** [1] | Always pick the most probable token (T=0). | |
| **Grounded answer** [3] | An answer that uses only the provided sources, cites them, and says "I don't know" when they don't contain the answer. | A report that footnotes every claim |
| **Hallucination** [1] | Fluent, confident output not supported by facts or sources: a consequence of the training objective. | |
| **HNSW** [3] | Hierarchical Navigable Small World: a layered graph index for ANN search. `m` = links per node, `ef_construction` = build effort, `ef_search` = query effort (recall vs latency). | Skip lists, generalised to a graph of neighbours |
| **Human-in-the-loop approval** [2, 4] | Requiring a person to approve a tool call before it executes. | A manual approval gate in a deploy pipeline |
| **Hybrid search** [3] | Combining keyword (BM25/full-text) and vector search, often fused with RRF. | |
| **Idempotency key** [4] | A stable id for a side effect, so retries and replays execute it once. For agents: derived from the tool call id, never written by the model. | `Idempotency-Key` header on payment APIs |
| **Idempotent ingestion** [3] | Re-running ingestion produces the same index: unchanged documents are skipped by content hash, changed ones replaced atomically, deleted ones removed. | `rsync` / a declarative migration, not a one-off import script |
| **Inference** [1] | Running a trained model to produce outputs; weights frozen. | Running the binary in production |
| **`input_required` / MRTR** [5] | Multi round-trip request: a server answers with `resultType: "input_required"` (questions + `requestState`) and the client retries the same call with the answers. Replaces server→client requests. | A 2-step form with a signed hidden field |
| **JSON mode** [2] | Guarantees syntactically valid JSON, but not your schema. | `Content-Type: application/json` without validation |
| **KV cache** [1] | Stored keys/values of processed tokens so each new token doesn't recompute the prefix. | Memoisation |
| **Lethal trifecta** [4] | An agent with private data access + exposure to untrusted content + a way to communicate externally can be injected into exfiltrating data. Remove a leg. | XSS + session cookie + open redirect, as a combination to break |
| **Logits** [1] | Raw, unnormalized scores over the vocabulary for the next token. | Ranked search results with scores |
| **MCP host / client / server** [5] | Host: the AI app the user talks to (runs the model). Client: one connection object per server, inside the host. Server: a program exposing capabilities; it never talks to the model. | Browser (host) · fetch client · API server |
| **MCP (Model Context Protocol)** [5] | Open protocol for exposing tools, resources and prompts to AI hosts. Current revision 2026-07-28: stateless JSON-RPC over stdio or Streamable HTTP. | LSP for AI tools / a USB-C port for context |
| **MCP prompt** [5] | A user-picked template with arguments, often a slash command, that may embed resources. | A saved query / form template |
| **MCP resource** [5] | Data addressed by URI (`handbook://billing-and-refunds`), attached as context by the app or user rather than chosen by the model. | A GET-able URL |
| **`_meta` envelope** [5] | Per-request metadata (`io.modelcontextprotocol/protocolVersion`, `clientCapabilities`, `clientInfo`) that makes every 2026-07-28 request self-describing. | Headers that make a REST call stateless |
| **Mixture of Experts (MoE)** [1] | Architecture where only some "expert" sub-networks run per token. | Routing requests to a subset of services |
| **MLP / feed-forward** [1] | Per-token sub-network in each transformer block; much of the stored knowledge lives here. | |
| **MRR (mean reciprocal rank)** [3] | Average of 1/rank of the first relevant result per query. 1.0 = always first. | "How far down the page is the first good result?" |
| **nDCG** [3] | Normalised discounted cumulative gain: a ranking score that rewards relevant results more the higher they appear, and supports graded relevance. | Search-ranking quality as used by web search teams |
| **OpenAI-compatible API** [2] | The `/chat/completions` wire format many providers accept (Groq, OpenRouter, Ollama, vLLM, Gemini). | A de facto standard protocol |
| **Orchestrator-workers** [4] | Workflow: an LLM plans subtasks at run time, workers handle them (often in parallel), a final call synthesises. | A job queue with a dynamic planner |
| **pass@k / pass^k** [4] | pass@k: at least one of k attempts succeeds. pass^k: all k succeed. pass^k is the reliability users experience. | "Works on retry" vs "works every time" (flaky tests) |
| **pgvector** [3] | Postgres extension adding `vector`/`halfvec` types, distance operators (`<=>` cosine) and HNSW/IVFFlat indexes. | Vectors as just another indexed column, next to your relational data |
| **Post-training** [1] | SFT + preference/RL stages that turn a base model into an assistant. | |
| **Prefill** [1] | Processing the whole prompt in parallel before the first output token. Drives TTFT. | |
| **prepareStep** [4] | AI SDK hook that runs before each agent step and can change the model, active tools, tool choice, instructions or messages for that step. | Per-request middleware |
| **Pre-training** [1] | Next-token prediction over a huge corpus; produces the base model. | The expensive build step |
| **Prompt caching** [2] | Provider-side reuse of a previously processed prompt prefix at a discount. | A CDN cache for the prefix of your request |
| **Prompt injection** [7] | Untrusted content containing instructions that the model follows. | Like SQL injection, but no reliable escaping exists |
| **Protected Resource Metadata** [5] | RFC 9728 document (`/.well-known/oauth-protected-resource/...`) telling clients which authorization server issues tokens for this MCP server, and which scopes exist. | The "login here" pointer in a 401 |
| **Quantization** [1, 6] | Storing or computing weights/activations at lower precision (int8, 4-bit) to save memory and time, at some accuracy cost. | Lossy compression |
| **RAG (retrieval-augmented generation)** [3] | Retrieve relevant documents and put them in the prompt so the model answers from them. | Server-side includes of fresh data at request time |
| **Reasoning / thinking tokens** [1, 2] | Hidden output tokens a reasoning model generates before answering; billed as output. | |
| **Reasoning effort** [2] | Setting controlling how many hidden thinking tokens a model may use (`reasoning: 'low'…'max'`). | A CPU budget per request |
| **Recall@k / precision@k** [3] | Recall@k: share of relevant items found in the top k. Precision@k: share of the top k that is relevant. | "Did we find it at all?" vs "how much noise did we return?" |
| **requestState** [5] | Opaque string a server returns with `input_required` and the client echoes on retry. Attacker-controlled: sign it, expire it, bind it to the caller and the arguments. | A signed, expiring CSRF token |
| **Reranker** [3] | A slower, more accurate model that re-scores retrieved candidates. | A second-stage sort after a coarse index scan |
| **Residual stream** [1] | The running per-token vector each block adds its output onto. | A request context object enriched by middleware |
| **Retry-After** [2] | Response header telling the client how long to wait before retrying (429/503). | Same as in HTTP generally: honour it |
| **RoPE** [1] | Rotary position embeddings: encode position by rotating query/key vectors. | |
| **Routing** [4] | Workflow: classify the input once, then hand it to a specialised prompt, model or tool set. | An API gateway |
| **RRF (reciprocal rank fusion)** [3] | Merges ranked lists by summing 1/(k + rank) per item (k≈60). Uses ranks only, so no score normalisation between systems. | Merging results from two search backends by position, not by their incomparable scores |
| **Rug pull** [5] | A server that changes its tool definitions after the user approved them. Defense: pin fingerprints, re-approve on change. | A dependency turning malicious in a patch release; lockfile hashes |
| **Sampling** [1] | Turning a probability distribution into one chosen token (temperature, top-k, top-p). | A load-balancing policy over ranked candidates |
| **Scope challenge / step-up** [5] | `403 insufficient_scope` naming the scope a call needs, so the client can get a bigger token and retry. | RBAC with a re-auth prompt |
| **`server/discover`** [5] | The 2026-07-28 request that returns a server's supported protocol versions, capabilities and identity; replaces the `initialize` handshake. | `OPTIONS` / a capabilities endpoint |
| **SFT** [1] | Supervised fine-tuning on example conversations; teaches instruction following. | |
| **Softmax** [1] | Turns scores into probabilities that sum to 1: exp(zᵢ)/Σexp(zⱼ). | |
| **SSE (Server-Sent Events)** [2] | `text/event-stream` responses made of `data:` lines and blank-line-terminated events; how LLMs stream. | One-way streaming over plain HTTP |
| **Stateless (API)** [1] | Each request is independent; history exists only if you resend it. | REST with no server session |
| **stdio transport** [5] | The host starts the server as a child process; newline-delimited JSON-RPC on stdin/stdout. stdout is the protocol, so logs go to stderr. | A CLI piped to another CLI |
| **Stop condition** [4] | A rule that ends the agent loop: done tool called, step cap, token or cost budget, timeout. Record which one fired. | `while` guard + deadline + circuit breaker |
| **Streamable HTTP** [5] | MCP over `POST /mcp`, answered with JSON or an SSE stream; `Mcp-Method`/`Mcp-Name` headers for routing. Needs auth. | A JSON-RPC API behind a gateway |
| **Structured output** [2] | Constraining the model to emit JSON matching a schema. | Response validation with a schema |
| **System prompt** [2] | Top-priority instructions that frame the model's behaviour for a request. | Server-side config injected into every request |
| **Teacher forcing** [1] | Training trick: predict every next token in parallel, given the true previous tokens. | |
| **Temperature** [1] | Divides logits before softmax: <1 sharpens, >1 flattens, 0 = greedy. | |
| **Thundering herd** [2] | Many clients retrying in lockstep and overwhelming a recovering service. | Same as in any distributed system |
| **Token** [1] | The unit an LLM reads/writes: a subword piece with an integer id. | |
| **Token passthrough** [5] | Accepting tokens not issued for your server, or forwarding a client's token downstream. Forbidden in MCP: makes you a confused deputy. | Forwarding a user's cookie to another service |
| **Tool / function calling** [2] | The model emits a structured request to call a function; **your code** executes it and returns the result. | An RPC request the model asks you to make |
| **Tool annotations** [5] | Hints on a tool (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) for hosts' UX. Not a security control. | HTTP method semantics: a convention, not enforcement |
| **Tool approval (human-in-the-loop)** [4] | The loop pauses on a risky tool call until a person approves or denies; resumes in a new request. AI SDK: `toolApproval`. | Two-person rule / change approval |
| **Tool poisoning** [5] | Instructions for the model hidden in a tool's description (often with zero-width characters), active as soon as the server is connected. | A malicious README your build executes |
| **ToolLoopAgent** [4] | AI SDK 7 class that runs the model ⇄ tools loop with stop conditions, approvals and per-step hooks. | A job runner around an RPC |
| **Top-k / top-p (nucleus)** [1] | Keep the k most likely tokens, or the smallest set whose cumulative probability ≥ p, before sampling. | Health checks that drop bad candidates |
| **Trajectory** [4] | The sequence of tool calls (with inputs and outcomes) an agent made; checked in evals alongside the final state. | A request trace / audit trail |
| **Transformer** [1] | Architecture of stacked blocks (attention + MLP + residuals). | A middleware pipeline |
| **tsvector / full-text search** [3] | Postgres' built-in keyword search: text is parsed into normalised lexemes (`tsvector`), matched by a `tsquery`, indexed with GIN and ranked with `ts_rank`. Not BM25. | `LIKE` grown up: stemming, stopwords and an inverted index |
| **TTFT** [1, 7] | Time to first token: prefill + queueing latency. | Time to first byte |
| **UI message stream** [2] | The AI SDK's typed SSE protocol between your server and `useChat` (text deltas, tool parts, metadata). | Your app's own streaming API contract |
| **Vector database** [3] | Storage + approximate nearest-neighbour index over embeddings (e.g. pgvector HNSW). | An index optimised for "nearest", not "equal" |
| **Workflow (vs agent)** [4] | LLM calls on a path fixed by your code. Cheaper, faster and more testable than an agent; the default choice. | A request handler vs a planner |
