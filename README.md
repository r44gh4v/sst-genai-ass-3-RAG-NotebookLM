# SST GenAI NotebookLM RAG (Assignment 3)

A minimal RAG app that lets a user upload a PDF or plain text file and ask grounded questions. 

The pipeline is explicit: 

ingestion -> chunking -> embeddings -> vector store -> retrieval -> generation.

## Features

- Upload PDF, TXT, or CSV
- Chunking with overlap for recall
- Embedding + storage in Qdrant Cloud
- Retrieval constrained by document ID
- Gemini via OpenAI-compatible API for answers
- Grounded answers with citations
- Low token usage controls (small k, context cap, output cap, cache)

## Tech Stack

- Node.js + Express
- Qdrant Cloud (vector DB)
- OpenAI-compatible client (Gemini by default)
- Simple web UI

## Chunking Strategy

This project uses a recursive, overlap-based chunking strategy:

- Fixed chunk size with overlap (defaults: 900 chars, 150 overlap)
- Prefer splitting on paragraph and sentence boundaries
- Deduplicate identical chunks
- Cap total chunks per document to protect free tiers

## Low-Request Defaults

- Small retrieval k (default 5)
- Context trimmed to a max character budget (default 8000 chars)
- Single LLM call per question
- Output tokens capped (default 4000)
- In-memory LRU cache for repeated questions

## Setup

1. Create a Qdrant Cloud cluster (free tier works).
2. Get your Qdrant URL and API key.
3. Get a free NVIDIA NIM API key (`nvapi-...`) from https://build.nvidia.com (used for chat, judge, rewrite, rerank).
4. Get a Google Gemini API key from https://aistudio.google.com/apikey (used for embeddings only).
5. Copy the example env file and fill values:

```bash
cp .env.example .env
```

## Configuration

Configuration is split in two:

- **`.env`** - secrets only (API keys + the private Qdrant cluster URL). Copy from `.env.example`.
- **`app.config.json`** - all non-sensitive settings (models, base URLs, RAG tuning, corrective RAG behavior, cache, limits). Edit this file directly.

### Secrets (`.env`)

Required:

- `CHAT_API_KEY` - NVIDIA NIM key (`nvapi-...`)
- `EMBEDDING_API_KEY` - Google Gemini key (required; embeddings use a different provider, so there is **no fallback** to `CHAT_API_KEY`)
- `QDRANT_URL`
- `QDRANT_API_KEY`

Optional (each falls back to `CHAT_API_KEY` when blank):

- `JUDGE_API_KEY`, `REWRITE_API_KEY`, `RERANK_API_KEY`

### Models (`app.config.json`)

| Stage | Provider | Model |
|---|---|---|
| Chat (answers) | NVIDIA NIM | `meta/llama-3.3-70b-instruct` |
| Judge (corrective RAG) | NVIDIA NIM | `meta/llama-3.3-70b-instruct` |
| Rewrite | NVIDIA NIM | `meta/llama-3.1-8b-instruct` |
| Rerank | NVIDIA NIM | `meta/llama-3.1-8b-instruct` |
| Embeddings | Google Gemini | `gemini-embedding-001` |

### Other settings (`app.config.json`)

- `qdrant.collection` - Qdrant collection name
- `rag` - `chunkSize`, `chunkOverlap`, `topK`, `maxContextChars`, `maxOutputTokens`, etc.
- `corrective` - `enabled`, `retries`, `confidenceThreshold`, `topK`, `rewriteCount`, `rerank`, `rerankTopN`, `rerankChunkChars`
- `cache`, `upload`, `server`

Note: corrective RAG adds extra model calls (judge, rewrite, rerank). Set `corrective.enabled` to `false` or `corrective.retries` to `0` in `app.config.json` to minimize cost and latency.

## Run Locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

## Usage

1. Upload a PDF, TXT, or CSV file.
2. Copy the returned docId (shown in the UI).
3. Ask questions in the chat panel.
4. Answers are grounded and include citations like [1].

## Manual Test Checklist

- Upload a PDF and ask 3 to 5 questions.
- Upload a text file and repeat.
- Confirm that answers cite sources and refuse missing info.
- Repeat one question to confirm cache hits (no extra LLM call).
