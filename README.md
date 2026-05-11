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

- Small retrieval k (default 3)
- Context trimmed to a max character budget
- Single LLM call per question
- Output tokens capped (default 350)
- In-memory LRU cache for repeated questions

## Setup

1. Create a Qdrant Cloud cluster (free tier works).
2. Get your Qdrant URL and API key.
3. Get a Gemini API key from Google AI Studio.
4. Copy the example env file and fill values:

```bash
cp .env.example .env
```

## Environment Variables

Minimum required:

- `CHAT_API_KEY`
- `QDRANT_URL`
- `QDRANT_API_KEY`

Optional but recommended:

- `CHAT_BASE_URL` (default Gemini OpenAI-compatible endpoint)
- `CHAT_MODEL` (default `gemini-3-flash-preview`)
- `EMBEDDING_MODEL` (default `gemini-embedding-2-preview`)
- `TOP_K`, `MAX_CONTEXT_CHARS`, `MAX_OUTPUT_TOKENS` for cost control

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
