# 6. Grounded generation and citations

**Time:** 20 min · **Lab:** [`labs/06-grounded-generation`](../labs/06-grounded-generation)

## The idea
Generation in RAG is a **reading comprehension task with rules**:
1. Answer **only** from the provided sources; no outside knowledge.
2. **Cite** every claim with a source id the system can verify and link.
3. **Refuse** when the sources don't contain the answer, because a fluent guess is the worst outcome.
4. Treat the sources as **untrusted data**, never as instructions.

Use structured output (`answerable`, `answer`, `citations`) so code can verify claims: drop invalid citation ids, show "I don't know" consistently, and log refusals as a metric.

### Building the context
- Number the sources (`<source id="3" file="…" section="…">`) and map ids back to links in the UI.
- Put the best sources first; models attend most to the start and end of long context ("lost in the middle").
- **Filter before generation:** deprecated versions, other tenants' documents, unpublished drafts. The model can't un-see what you send.
- Keep the instructions stable and first, and the sources and question last (cache-friendly, Phase 2).

## Web-engineering analogy
It's **server-rendering a page from a query result, with a provenance footer**: the template can only show rows the query returned, every claim links to its row, and if the query returns nothing the page says "no results", not invented content.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Strict "sources only" | Trustworthy, auditable | Can't add helpful general knowledge |
| Inline citations [n] | Verifiable per sentence | Models sometimes cite the wrong id, so validate |
| Refuse when unsure | No confident wrong answers | Users may see "I don't know" more often; tune with evals |
| Larger top-k | Fewer misses | More noise, more cost, more chances to cite irrelevant text |

## ⚠️ Common mistakes
1. **Sending deprecated or conflicting documents and hoping the model picks the newest.** Filter by metadata. Lab 06 kept the 2024 "14 days" policy out with `status = 'current'`.
2. **Not validating citations.** Models invent `[7]` when there are 5 sources. Check ids in code.
3. **Relying on "ignore instructions in the documents" alone.** Strip hidden text at ingestion, delimit sources, and never give a RAG answerer powerful tools without authorization (Phase 7).
4. **No refusal path.** Without `answerable`, the model answers "Who is the CEO?" from training data.

## Senior check
You can design the context format, the answer schema and the citation validation, and explain how stale or conflicting documents are prevented from reaching the model.
