import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { config } from "../config.js";
import { answerCache } from "./cache.js";
import { chunkText } from "./chunking.js";
import { loadDocumentsFromFile } from "./loaders.js";
import { embedQuery, embedTexts, getChatClient } from "./openai.js";
import {
  collectionExists,
  countByDocId,
  ensureCollection,
  searchByDocId,
  upsertPoints
} from "./qdrant.js";

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function writeTempFile(buffer, originalName) {
  const safeName = String(originalName || "upload")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  const dir = path.join(os.tmpdir(), "sst-genai-ass-3-rag-notebook-lm");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(
    dir,
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`
  );
  await fs.writeFile(filePath, buffer);
  return filePath;
}

function compactWhitespace(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function buildContext(results) {
  const contextParts = [];
  const citations = [];
  let total = 0;

  results.forEach((result, index) => {
    const payload = result.payload || {};
    const rawText = payload.text || "";
    const trimmed = compactWhitespace(rawText).slice(0, config.maxChunkChars);
    if (!trimmed) {
      return;
    }
    if (total + trimmed.length > config.maxContextChars) {
      return;
    }
    const label = index + 1;
    const page = payload.page || "n/a";
    contextParts.push(`[${label}] page ${page}: ${trimmed}`);
    citations.push({
      index: label,
      page,
      source: payload.source || "",
      chunkId: payload.chunkId || String(result.id || label),
      score: result.score
    });
    total += trimmed.length;
  });

  return {
    contextText: contextParts.join("\n"),
    citations
  };
}

export async function indexDocument({ buffer, mimeType, originalName }) {
  if (!buffer) {
    throw new Error("Missing file buffer");
  }

  const docId = hashBuffer(buffer);
  const exists = await collectionExists();
  if (exists) {
    const count = await countByDocId(docId);
    if (count > 0) {
      return { docId, chunks: count, reused: true };
    }
  }

  const filePath = await writeTempFile(buffer, originalName);
  let documents;
  try {
    documents = await loadDocumentsFromFile(filePath, mimeType, originalName);
  } finally {
    await fs.unlink(filePath).catch(() => undefined);
  }

  const chunkItems = [];
  const seen = new Set();
  documents.forEach((doc) => {
    const pieces = chunkText(doc.text, {
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      maxChunks: config.maxChunks
    });
    pieces.forEach((piece) => {
      if (chunkItems.length >= config.maxChunks) {
        return;
      }
      const key = hashText(piece);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      chunkItems.push({
        text: piece,
        page: doc.page,
        source: doc.source
      });
    });
  });

  if (!chunkItems.length) {
    throw new Error("No readable text found in the document");
  }

  let vectorSize;
  const batchSize = Math.max(config.embeddingBatchSize, 1);
  for (let i = 0; i < chunkItems.length; i += batchSize) {
    const batch = chunkItems.slice(i, i + batchSize);
    const embeddings = await embedTexts(batch.map((item) => item.text));
    if (!vectorSize && embeddings[0]) {
      vectorSize = embeddings[0].length;
      await ensureCollection(vectorSize);
    }

    const points = batch.map((item, offset) => {
      const chunkId = i + offset + 1;
      return {
        id: crypto.randomUUID(),
        vector: embeddings[offset],
        payload: {
          docId,
          chunkId,
          source: item.source,
          page: item.page,
          text: item.text
        }
      };
    });

    await upsertPoints(points);
  }

  return { docId, chunks: chunkItems.length, reused: false };
}

export async function answerQuestion({ docId, question }) {
  if (!docId) {
    throw new Error("Missing docId");
  }
  if (!question || !question.trim()) {
    throw new Error("Missing question");
  }

  const cacheKey = `${docId}:${question.trim().toLowerCase()}`;
  const cached = answerCache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const queryVector = await embedQuery(question);
  const results = await searchByDocId(docId, queryVector, config.topK);

  if (!results.length) {
    return {
      answer: "I could not find that in the document.",
      citations: [],
      cached: false
    };
  }

  const { contextText, citations } = buildContext(results);
  if (!contextText) {
    return {
      answer: "I could not find that in the document.",
      citations: [],
      cached: false
    };
  }

  const systemPrompt =
    "You are a document Q&A assistant. " +
    "Answer ONLY using the context provided below. " +
    "If the answer is not in the context, say: 'I could not find that in the document.' " +
    "Always write complete, grammatically correct sentences — never stop mid-sentence or end a response with a comma. " +
    "Cite evidence inline using [1], [2], etc.";

  const chatClient = getChatClient();
  const response = await chatClient.chat.completions.create({
    model: config.chatModel,
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\nContext:\n${contextText}`
      },
      {
        role: "user",
        content: question
      }
    ],
    temperature: 0.2,
    max_tokens: config.maxOutputTokens
  });

  const answer = response.choices?.[0]?.message?.content?.trim() || "";
  const result = {
    answer: answer || "No response generated.",
    citations,
    cached: false
  };

  answerCache.set(cacheKey, result);
  return result;
}
