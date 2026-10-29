# Resources: a curated guide, not a link dump

Every link was checked on **2026-10-10/11** (reachable, and for blogs and newsletters, posting within the last few months). Stale items were dropped. Example: Chip Huyen's blog hasn't posted since January 2025, so only her book is listed. **Level:** B = base, I = intermediate, A = advanced. **Phase** = where it pays off most.

Primary sources first: official docs, lab engineering blogs and original authors. TypeScript-friendly material is marked **TS**.

## 1. Blogs and newsletters (engineering, not hype)
| Source | Why it's worth your time | Level | Phase |
|---|---|---|---|
| [Simon Willison's weblog](https://simonwillison.net/) | The best single filter on what's new and what actually works. Hands-on, skeptical, and the canonical writer on prompt injection. | B–A | all, esp. 2, 7 |
| [Anthropic Engineering](https://www.anthropic.com/engineering) | Primary-source posts on agents, tool design, context engineering and evals from a frontier lab. Start with [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) and [Contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval). | I–A | 3, 4, 5, 7 |
| [Hamel Husain](https://hamel.dev/) | The practical authority on evals: error analysis, LLM-as-judge done right, "look at your data". | I–A | 7 |
| [Eugene Yan](https://eugeneyan.com/) | Patterns for LLM systems, RAG, evals and product thinking, from someone who ships at scale. | I–A | 3, 7 |
| [Jason Liu (jxnl.co)](https://jxnl.co/) | Pragmatic RAG: "RAG is a recommendation system", retrieval metrics, structured outputs. | I | 2, 3 |
| [Latent Space](https://www.latent.space/) | Newsletter + podcast for AI engineers: the industry map, interviews with tool builders. | I | all |
| [Sebastian Raschka: Ahead of AI](https://magazine.sebastianraschka.com/) | Clear explanations of model architectures, open models and fine-tuning research. | I–A | 1, 6 |
| [Interconnects (Nathan Lambert)](https://www.interconnects.ai/) | *(Optional)* Post-training, RLHF and open models from an insider. Deeper than you need for shipping. | A | 1, 6 |
| [MCP blog](https://blog.modelcontextprotocol.io/) | Official spec announcements, e.g. the 2026-07-28 stateless revision. Primary source for Phase 5. | I | 5 |
| [Applied LLMs: "What we learned from a year of building with LLMs"](https://applied-llms.org/) | One-time read. Hard-won tactical, operational and strategic lessons from practitioners. | I | 7, 8 |

## 2. Courses
| Course | Cost · length | Why | Level | Phase |
|---|---|---|---|---|
| [Anthropic Academy](https://anthropic.skilljar.com/): *Building with the Claude API*, *Introduction to MCP*, *MCP: Advanced Topics* | Free · self-paced. *Building with the Claude API* is ~86 lessons/exercises (length not published; budget 8–10 h) | Official and current. Covers caching, citations, tool use, RAG and MCP. Examples are Python, so translate them to TS as practice. | B–I | 2, 5 |
| [Anthropic courses (GitHub)](https://github.com/anthropics/courses) | Free · ~4–6 h for the prompt-engineering tutorial | The interactive prompt-engineering tutorial is the best structured intro to prompting. Notebooks are Python, but the lessons are language-agnostic. | B | 2 |
| [AI Hero: AI SDK v6 Crash Course](https://www.aihero.dev/workshops/ai-sdk-v6-crash-course) (Matt Pocock) | **Paid** ($149 at time of checking) · 94 short videos (~3–5 h) + 59 exercises · *(optional)*. The site also has free AI SDK tutorials | **TS**, 100% TypeScript. The best TS-native AI SDK teaching: streaming, tools, workflows, evals. Built on v6; the v7 differences are covered by the official codemod. | B–I | 2, 4 |
| [Hugging Face MCP Course](https://huggingface.co/learn/mcp-course) | Free · 5 chapters × ~3–4 h (~15–20 h; skim to the units you need) · *(optional)* | Protocol concepts plus building servers and clients, with Python **and TS** examples. It names no spec version, so check it against the 2026-07-28 changes (no `initialize` handshake, no session header). | I | 5 |
| [Hugging Face LLM Course](https://huggingface.co/learn/llm-course) | Free · *(optional)* | Deeper model internals and fine-tuning. Python. Useful for Phase 6's LoRA section. | I–A | 1, 6 |
| [Hugging Face Agents Course](https://huggingface.co/learn/agents-course) | Free · *(optional)* | Agent theory and framework comparisons. Python, so read for concepts. | I | 4 |
| [DeepLearning.AI short courses](https://www.deeplearning.ai/short-courses/) | Free · 1–2 h each · *(optional)* | Quick, focused intros (RAG, evals, MCP, agents) taught with vendor engineers. Mostly Python. | B–I | 2–7 |
| [Neural Networks: Zero to Hero (Karpathy)](https://karpathy.ai/zero-to-hero.html) | Free · ~20 h · *(optional)* | Build a GPT from scratch. The deepest intuition you can get, but not needed to ship features. | A | 1 |
| [AI Evals for Engineers & PMs (Hamel Husain, Shreya Shankar)](https://maven.com/parlance-labs/evals) | **Paid** ($4,200) · 8 weeks × 3–5 h. Current cohort Oct 10 – Nov 21 2026 is the last of 2026 · *(optional)* | The definitive evals course. Only worth it if evals become your job. | I–A | 7 |
| *AI Engineering* (Chip Huyen, O'Reilly 2025), book | **Paid** · ~15 h reading · *(optional)* | The best single book on building with foundation models: evals, RAG, agents, inference optimisation. | I–A | 3, 7 |


## 3. YouTube
| Channel / video | Why | Level | Phase |
|---|---|---|---|
| [3Blue1Brown](https://www.youtube.com/@3blue1brown): [LLMs explained briefly](https://www.youtube.com/watch?v=LPZh9BOjkQs) (8 min), [Transformers, Ch. 5](https://www.youtube.com/watch?v=wjZofJX0v4M) (27 min), [Attention, Ch. 6](https://www.youtube.com/watch?v=eMlx5fFNoYc) (26 min) | The clearest visual intuition for embeddings and attention that exists. | B | 1 |
| [Andrej Karpathy](https://www.youtube.com/@AndrejKarpathy): [Intro to LLMs](https://www.youtube.com/watch?v=zjkBMFhNj_g) (1 h), [Deep Dive into LLMs like ChatGPT](https://www.youtube.com/watch?v=7xTGNNLPyMI) (3.5 h), [Let's build the GPT Tokenizer](https://www.youtube.com/watch?v=zduSFxRajkE) (2 h, *optional*) | From the person who built much of this. The best mental models for training vs inference. | B–A | 1 |
| [AI Engineer](https://www.youtube.com/@aiDotEngineer) | Conference talks by practitioners on RAG, agents, evals and MCP in production. Pick talks by topic, don't binge. | I–A | 3–8 |
| [Anthropic](https://www.youtube.com/@anthropic-ai) | Official deep dives on prompting, agents, MCP and Claude features. | B–I | 2, 4, 5 |

## 4. Platforms, docs and communities to follow
**Official docs (your primary reference, always over blog posts)**
| Resource | Why | Phase |
|---|---|---|
| [Claude Platform docs](https://platform.claude.com/docs) | Messages API, tool use, prompt caching, token counting, model lifecycle. | 2–8 |
| [OpenAI API docs](https://developers.openai.com/api/docs) | Responses API, structured outputs, models, changelog. | 2–8 |
| [Gemini API docs](https://ai.google.dev/gemini-api/docs) | The free-tier provider used in labs; embeddings (`gemini-embedding-2`). | 2, 3 |
| [Groq rate limits](https://console.groq.com/docs/rate-limits) · [OpenRouter limits](https://openrouter.ai/docs/api/reference/limits) · [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) | Know your free-tier ceilings before you hit 429s. | 2 |
| [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) | The SSE wire format every LLM stream uses. | 2 |
| [AWS: Exponential backoff and jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) | The classic analysis behind "full jitter" retries. | 2, 7 |
| [AI SDK docs](https://ai-sdk.dev/docs) **TS** | The framework used from Phase 2 on. | 2–8 |
| [MCP specification (2026-07-28)](https://modelcontextprotocol.io/specification/2026-07-28) · [MCP Registry](https://registry.modelcontextprotocol.io/) | The protocol itself, and where servers are published. | 5 |
| [pgvector](https://github.com/pgvector/pgvector) | Index types (HNSW/IVFFlat), iterative scans, tuning. | 3, 8 |
| [Supabase: Hybrid search](https://supabase.com/docs/guides/ai/hybrid-search) | Full-text + pgvector fused with RRF in one SQL function. The pattern behind Lab 03. | 3 |
| [Pinecone: Chunking strategies](https://www.pinecone.io/learn/chunking-strategies/) | Survey of fixed, structure-aware, semantic and contextual chunking. | 3 |
| [Jason Liu: Levels of complexity, RAG applications](https://jxnl.co/writing/2024/02/28/levels-of-complexity-rag-applications/) | A staged map from a basic pipeline to observability and evals. | 3, 7 |
| [AI SDK: RAG Agent guide](https://ai-sdk.dev/cookbook/guides/rag-chatbot) **TS** | *(Optional)* Next.js + pgvector + AI SDK, with retrieval as a tool. Simpler than the Phase 3 project; compare the designs. | 3, 4 |
| [Ollama docs](https://docs.ollama.com/) · [Ollama library](https://ollama.com/library) | Local runtime and the model catalogue sized for laptops. | 6 |
| [Unsloth docs](https://docs.unsloth.ai/) | *(Optional)* The fastest path to a LoRA fine-tune on a free Colab GPU. | 6 |
| [promptfoo docs](https://www.promptfoo.dev/docs/intro/) · [Langfuse docs](https://langfuse.com/docs) | Evals in CI; tracing and prompt management. | 7 |
| [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) | The vendor-neutral way to name LLM spans and attributes. | 7 |
| [OWASP Top 10 for LLM applications](https://genai.owasp.org/llm-top-10/) | The security checklist: prompt injection, insecure output handling, excessive agency… | 7 |

**Model hubs, leaderboards and tools**
| Resource | Why | Phase |
|---|---|---|
| [Hugging Face Hub](https://huggingface.co/) + [transformers.js](https://github.com/huggingface/transformers.js) **TS** | Open models and the library that runs them in Node/the browser (Phase 1 labs). | 1, 3, 6 |
| [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard) | Compare embedding models, but verify on *your* data (Phase 3). | 3 |
| [Artificial Analysis](https://artificialanalysis.ai/) | Independent price, latency and quality comparisons across providers. | 2, 7 |
| [LMArena](https://lmarena.ai/) | Crowd-sourced head-to-head model rankings. A signal, not ground truth. | 2 |
| [OpenRouter models](https://openrouter.ai/models) | One API across many models, including `:free` ones. Good for quick comparisons. | 2, 6 |
| [Transformer Explainer](https://poloclub.github.io/transformer-explainer/) · [bbycroft LLM visualization](https://bbycroft.net/llm) · [Tiktokenizer](https://tiktokenizer.vercel.app/) | Interactive views of a real GPT-2, a 3D walk through an LLM, and real tokenizers. | 1 |

**Communities and people**
- [r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/): the best place for local-model news, quantization tips and hardware reality checks. (Phase 6)
- People worth following, via their blogs above: **Simon Willison**, **Andrej Karpathy**, **Hamel Husain**, **Eugene Yan**, **Jason Liu**, **Sebastian Raschka**.

## 5. Papers worth reading (only the ones that matter to an engineer)
Read the abstract, the intro and the figures. That's enough unless you're curious.

| Paper | Two-line summary | Level | Phase |
|---|---|---|---|
| [Attention Is All You Need (2017)](https://arxiv.org/abs/1706.03762) | Introduced the transformer: self-attention replaces recurrence, so training parallelises across positions. Every modern LLM descends from it. | I | 1 |
| [Language Models are Few-Shot Learners, GPT-3 (2020)](https://arxiv.org/abs/2005.14165) | Showed that scale plus in-context examples lets one model do many tasks without fine-tuning. The origin of "prompting as programming". | B | 1, 2 |
| [Training language models to follow instructions, InstructGPT (2022)](https://arxiv.org/abs/2203.02155) | SFT + RLHF turn a base model into an assistant. A small, aligned model beat a 100× larger base model on human preference. | I | 1 |
| [Sentence-BERT (2019)](https://arxiv.org/abs/1908.10084) | Trained networks to produce sentence embeddings comparable with cosine similarity. The foundation of semantic search. | I | 1, 3 |
| [Retrieval-Augmented Generation (2020)](https://arxiv.org/abs/2005.11401) | Coined RAG: retrieve documents and condition generation on them, for fresher, more factual output. | I | 3 |
| [Lost in the Middle (2023)](https://arxiv.org/abs/2307.03172) | Models use information at the start and end of long contexts far better than the middle. That's why context placement matters. | B | 1, 3 |
| [ReAct (2022)](https://arxiv.org/abs/2210.03629) | Interleaving reasoning and tool actions in a loop beats either alone. The blueprint of today's agent loop. | I | 4 |
| [LoRA (2021)](https://arxiv.org/abs/2106.09685) | Fine-tune by training tiny low-rank adapter matrices instead of all weights, at a fraction of the memory. The default way to fine-tune. | A | 6 |
| [Indirect Prompt Injection (2023)](https://arxiv.org/abs/2302.12173) | Retrieved or tool content can hijack an LLM app, which turns every data source into an attack surface. Essential reading before shipping agents. | I | 7 |
| [Judging LLM-as-a-Judge (2023)](https://arxiv.org/abs/2306.05685) | Strong LLMs agree with human preferences ~80% of the time, but have position, verbosity and self-preference biases. How to use judges carefully. | I | 7 |

## 6. Stay current: the 30-minute weekly routine
See [ROADMAP.md → Stay current](ROADMAP.md#stay-current-a-30-minute-weekly-habit): Simon Willison (5 min) → stack changelogs (5) → one deep post (10) → Artificial Analysis + Ollama library (5) → write one thing to try (5).
