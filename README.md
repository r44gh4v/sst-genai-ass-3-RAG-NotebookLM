# SST GenAI NotebookLM RAG (Assignment 3)

A minimal RAG app that lets a user upload a PDF, TXT, or CSV file and ask grounded questions about it.

The pipeline is explicit:

**ingestion → chunking → embeddings → vector store → retrieval → generation → (corrective loop)**

## Features

- Upload PDF, TXT, or CSV (up to 5 MB)
- Recursive overlap-based chunking for recall
- Embeddings via Google Gemini (`gemini-embedding-2`)
- Vector storage and retrieval in Qdrant Cloud, constrained by document ID
- Grounded answers with inline citations from NVIDIA NIM (`llama-3.3-70b-instruct`)
- **Corrective RAG** - judge scores confidence, rewrites the query, re-retrieves, and reranks before retrying
- In-memory LRU answer cache for repeated questions
- Cost controls: small k, context cap, output cap

## Corrective RAG Pipeline

When enabled (default), each answer goes through a verification loop:

1. **Retrieve** - embed the question, pull top-k chunks from Qdrant
2. **Generate** - LLM produces a grounded answer
3. **Judge** - a second LLM call scores confidence (0-1) and answerability
4. **If confidence < threshold** → **Rewrite** the query, re-retrieve with expanded k, **Rerank** the merged results, regenerate
5. Final answer, confidence score, and pipeline metadata are returned alongside citations

All corrective stages (judge, rewrite, rerank) fall back to the same NVIDIA NIM key and base URL as the chat stage unless overridden.

## Tech Stack

- Node.js + Express (served via Vercel Serverless Function)
- Qdrant Cloud - vector database
- NVIDIA NIM - chat, judge, rewrite, rerank (`llama-3.3-70b-instruct` / `llama-3.1-8b-instruct`)
- Google Gemini - embeddings only (`gemini-embedding-2`)
- OpenAI-compatible client for all LLM and embedding calls
- In-memory LRU cache

## Chunking Strategy

- Fixed chunk size with overlap (defaults: 900 chars, 150 overlap)
- Prefer splitting on paragraph and sentence boundaries
- Deduplicate identical chunks within a document
- Cap total chunks per document to protect free-tier quotas

## Configuration

Configuration is split into two files:

| File | Contains |
|---|---|
| `.env` | Secrets only - API keys and the private Qdrant cluster URL |
| `app.config.json` | Everything else - models, base URLs, RAG tuning, limits |

### Secrets (`.env`)

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `CHAT_API_KEY` | Yes | NVIDIA NIM key (`nvapi-…`) - used for chat, judge, rewrite, rerank |
| `EMBEDDING_API_KEY` | Yes | Google Gemini key - embeddings use a separate provider, no fallback |
| `QDRANT_URL` | Yes | Private Qdrant Cloud cluster endpoint |
| `QDRANT_API_KEY` | Yes | Qdrant API key |
| `JUDGE_API_KEY` | No | Falls back to `CHAT_API_KEY` |
| `REWRITE_API_KEY` | No | Falls back to `CHAT_API_KEY` |
| `RERANK_API_KEY` | No | Falls back to `CHAT_API_KEY` |

### Models (`app.config.json`)

| Stage | Provider | Model |
|---|---|---|
| Chat (answers) | NVIDIA NIM | `meta/llama-3.3-70b-instruct` |
| Judge | NVIDIA NIM | `meta/llama-3.3-70b-instruct` |
| Rewrite | NVIDIA NIM | `meta/llama-3.1-8b-instruct` |
| Rerank | NVIDIA NIM | `meta/llama-3.1-8b-instruct` |
| Embeddings | Google Gemini | `gemini-embedding-2` |

### Other settings (`app.config.json`)

| Key | Default | Description |
|---|---|---|
| `rag.chunkSize` | `900` | Characters per chunk |
| `rag.chunkOverlap` | `150` | Overlap between chunks |
| `rag.topK` | `5` | Chunks retrieved per question |
| `rag.maxContextChars` | `8000` | Total context budget fed to the LLM |
| `rag.maxOutputTokens` | `4000` | Max tokens in the answer |
| `corrective.enabled` | `true` | Toggle the corrective RAG loop |
| `corrective.retries` | `1` | Max correction attempts |
| `corrective.confidenceThreshold` | `0.55` | Judge score below which a retry is triggered |
| `corrective.rerank` | `true` | Rerank merged results before retry |
| `cache.ttlMs` | `600000` | Answer cache TTL (10 min) |
| `upload.maxFileMb` | `5` | Max upload size |

To reduce cost and latency, set `corrective.enabled` to `false` or `corrective.retries` to `0`.

## Setup

1. Create a Qdrant Cloud cluster - the free tier works.
2. Get a free NVIDIA NIM API key (`nvapi-…`) from https://build.nvidia.com - used for chat, judge, rewrite, and rerank.
3. Get a Google Gemini API key from https://aistudio.google.com/apikey - used for embeddings only.
4. Copy and fill the secrets file:

```bash
cp .env.example .env
```

5. Install dependencies and start:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Usage

1. Upload a PDF, TXT, or CSV file and click **Index document**.
2. Wait for indexing to complete - the Doc ID appears and the chat panel activates.
3. Type a question and press Send.
4. Answers are grounded in the document and include inline citations like `[1]`.
5. The **What is happening** panel shows live pipeline steps - retrieval, judge confidence, rewrite, rerank.

## Manual Test Checklist

- Upload a PDF and ask 3-5 questions; verify answers cite sources.
- Upload a TXT or CSV and repeat.
- Ask something not in the document; verify the model refuses with "I could not find that."
- Repeat a question and confirm `cached: true` appears in the pipeline log.
- Check the corrective RAG metadata (confidence, rerank, rewrite) in the activity log.
