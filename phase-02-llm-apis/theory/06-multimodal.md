# 6. Multimodal input

**Time:** 15 min · **Lab:** [`labs/06-multimodal`](../labs/06-multimodal)

## The idea
Images, PDFs, audio and video are **more content parts in a user message**. The model encodes them into tokens like any other input. In the AI SDK 7: `{ type: 'file', mediaType: 'image/png' | 'application/pdf' | …, data }`.

What it's good for: reading screenshots, charts, receipts, forms and scanned documents; UI bug reports; extracting fields from PDFs straight into a schema. In Lab 06 Gemini correctly read a bar chart **with no text at all** and extracted every field from an invoice PDF.

## Web-engineering analogy
It's a **multipart upload whose payload is billed by content, not bytes**. A 2 KB PNG cost **1,075 input tokens** in Lab 06, as much as ~4,000 characters of English. Think of each image as a big, fixed-size request header.

## Trade-offs
| Choice | Upside | Downside |
|---|---|---|
| Inline base64 | Simple, no storage | Request size; resent every turn of a chat (stateless!) |
| Provider file upload API / URLs | Upload once, reference many times | Lifecycle management, privacy, expiry |
| Native PDF input | Keeps layout and tables | Per-page image cost for scans; provider page limits |
| Extract text yourself (pdf → text) first | Cheap, cacheable, searchable | Loses layout; tables and charts break |

## ⚠️ Common mistakes
1. **Not budgeting image tokens.** Ten screenshots ≈ 10k tokens before the question, on every turn that resends history.
2. **Resending the same image in every chat turn.** Reference it once, summarize it, or drop it after use.
3. **Assuming OCR-level precision** on tiny or dense text, and handwriting. Validate extracted numbers (checksums, totals, cross-field rules).
4. **Sending user-uploaded files without checks.** Size limits, type sniffing, malware scanning, and PII policies still apply. Documents can contain **prompt injections** in white-on-white text (Phase 7).

## Senior check
You can estimate token cost for an image-heavy feature, choose between native PDF input and text extraction, and list the validation you'd put around document extraction.
