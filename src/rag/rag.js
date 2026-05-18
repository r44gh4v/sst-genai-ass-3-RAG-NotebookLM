import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { config } from "../config.js";
import { answerCache } from "./cache.js";
import { chunkText } from "./chunking.js";
import { loadDocumentsFromFile } from "./loaders.js";
import {
  embedTexts,
  getChatClient,
  getJudgeClient,
  getRewriteClient,
  getRerankClient
} from "./openai.js";
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

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function stableStringify(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`
  );
  return `{${entries.join(",")}}`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function extractJson(text) {
  if (!text) {
    return null;
  }
  const trimmed = String(text).trim();
  const direct = safeJsonParse(trimmed);
  if (direct) {
    return direct;
  }
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    const extracted = safeJsonParse(trimmed.slice(objectStart, objectEnd + 1));
    if (extracted) {
      return extracted;
    }
  }
  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return safeJsonParse(trimmed.slice(arrayStart, arrayEnd + 1));
  }
  return null;
}

function limitText(text, maxChars) {
  const safeMax = Number.isFinite(maxChars) ? maxChars : 0;
  if (safeMax <= 0) {
    return "";
  }
  return compactWhitespace(text).slice(0, safeMax);
}

function normalizeQueries(queries, fallback) {
  const list = Array.isArray(queries) ? queries : [queries];
  const normalized = [];
  const seen = new Set();
  list.forEach((query) => {
    const trimmed = limitText(query, 500);
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push(trimmed);
  });
  if (!normalized.length && fallback) {
    return [limitText(fallback, 500)];
  }
  return normalized;
}

function getResultKey(result) {
  const payload = result?.payload || {};
  if (payload.chunkId !== undefined && payload.chunkId !== null) {
    return String(payload.chunkId);
  }
  return String(result?.id || "");
}

function mergeResults(results) {
  const map = new Map();
  results.forEach((result) => {
    if (!result) {
      return;
    }
    const key = getResultKey(result);
    if (!key) {
      return;
    }
    const existing = map.get(key);
    if (!existing || (result.score || 0) > (existing.score || 0)) {
      map.set(key, result);
    }
  });
  return Array.from(map.values()).sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );
}

function resolveCorrectiveOptions(options) {
  const overrides = options && typeof options === "object" ? options : {};
  const enabled =
    typeof overrides.correctiveEnabled === "boolean"
      ? overrides.correctiveEnabled
      : config.correctiveEnabled;
  const retries = Number.isFinite(overrides.correctiveRetries)
    ? Math.max(0, overrides.correctiveRetries)
    : Math.max(0, config.correctiveRetries);
  const confidenceThreshold = Number.isFinite(
    overrides.correctiveConfidenceThreshold
  )
    ? clamp(overrides.correctiveConfidenceThreshold, 0, 1)
    : clamp(config.correctiveConfidenceThreshold, 0, 1);
  const expandedTopK = Number.isFinite(overrides.correctiveTopK)
    ? overrides.correctiveTopK
    : config.correctiveTopK;
  const rewriteCount = Number.isFinite(overrides.correctiveRewriteCount)
    ? Math.max(0, overrides.correctiveRewriteCount)
    : Math.max(0, config.correctiveRewriteCount);
  const rerank =
    typeof overrides.correctiveRerank === "boolean"
      ? overrides.correctiveRerank
      : config.correctiveRerank;
  const rerankTopN = Number.isFinite(overrides.rerankTopN)
    ? Math.max(1, overrides.rerankTopN)
    : Math.max(1, config.rerankTopN);
  const rerankChunkChars = Number.isFinite(overrides.rerankChunkChars)
    ? Math.max(120, overrides.rerankChunkChars)
    : Math.max(120, config.rerankChunkChars);

  return {
    enabled,
    retries,
    confidenceThreshold,
    expandedTopK: Math.max(config.topK, expandedTopK),
    rewriteCount,
    rerank,
    rerankTopN,
    rerankChunkChars
  };
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

async function retrieveForQueries(docId, queries, topK) {
  const normalized = normalizeQueries(queries);
  if (!normalized.length) {
    return [];
  }
  const embeddings = await embedTexts(normalized, config.embeddingQueryInputType);
  const merged = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const vector = embeddings[i];
    if (!vector) {
      continue;
    }
    const results = await searchByDocId(docId, vector, topK);
    merged.push(...results);
  }
  return merged;
}

async function generateAnswer(question, contextText) {
  const systemPrompt =
    "You are a document Q&A assistant. " +
    "Answer ONLY using the context provided below. " +
    "If the answer is not in the context, say: 'I could not find that in the document.' " +
    "Always write complete, grammatically correct sentences - never stop mid-sentence or end a response with a comma. " +
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

  return response.choices?.[0]?.message?.content?.trim() || "";
}

async function judgeAnswer({ question, answer, contextText }) {
  const judgeClient = getJudgeClient();
  const systemPrompt =
    "You are a strict verifier for a document QA system. " +
    "Given a question, context, and answer, output JSON ONLY with: " +
    "{\"confidence\":0-1,\"answerable\":true|false,\"issues\":[\"...\"]}. " +
    "Confidence is how strongly the answer is supported by the context. " +
    "If the answer is not supported, set confidence <= 0.3 and answerable false.";

  const response = await judgeClient.chat.completions.create({
    model: config.judgeModel,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Question: ${question}\n\nContext:\n${contextText}\n\nAnswer: ${answer}`
      }
    ],
    temperature: 0,
    max_tokens: config.judgeMaxTokens
  });

  const content = response.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);
  const confidence = Number.isFinite(parsed?.confidence)
    ? clamp(Number(parsed.confidence), 0, 1)
    : null;
  const answerable =
    typeof parsed?.answerable === "boolean" ? parsed.answerable : null;
  const issues = Array.isArray(parsed?.issues)
    ? parsed.issues.map((item) => String(item)).slice(0, 3)
    : [];

  return {
    confidence,
    answerable,
    issues
  };
}

async function rewriteQueries(question, count) {
  if (count <= 0) {
    return [];
  }
  const rewriteClient = getRewriteClient();
  const systemPrompt =
    "You rewrite user questions for document retrieval. " +
    "Generate concise alternatives that preserve intent and avoid adding new facts. " +
    "Return JSON ONLY as {\"queries\":[\"...\"]}.";

  const response = await rewriteClient.chat.completions.create({
    model: config.rewriteModel,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: question
      }
    ],
    temperature: 0.3,
    max_tokens: config.rewriteMaxTokens
  });

  const content = response.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);
  let queries = [];
  if (Array.isArray(parsed)) {
    queries = parsed;
  } else if (Array.isArray(parsed?.queries)) {
    queries = parsed.queries;
  }

  const normalizedQuestion = compactWhitespace(question).toLowerCase();
  const normalized = [];
  const seen = new Set();
  queries.forEach((query) => {
    const trimmed = limitText(query, 300);
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (key === normalizedQuestion || seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized.slice(0, count);
}

async function rerankResults(question, results, topN, maxChunkChars) {
  if (!results.length) {
    return results;
  }
  const take = Math.min(Math.max(topN, 1), results.length);
  const subset = results.slice(0, take);
  const items = subset
    .map((result) => {
      const payload = result.payload || {};
      const snippet = limitText(payload.text || "", maxChunkChars);
      if (!snippet) {
        return null;
      }
      return {
        id: getResultKey(result),
        text: snippet,
        score: result.score || 0
      };
    })
    .filter(Boolean);

  if (!items.length) {
    return results;
  }

  const rerankClient = getRerankClient();
  const systemPrompt =
    "You are a reranker for document chunks. " +
    "Return JSON ONLY as {\"rankings\":[{\"id\":\"...\",\"relevance\":0-1}]}. " +
    "Use only the provided ids.";

  const response = await rerankClient.chat.completions.create({
    model: config.rerankModel,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Question: ${question}\n\nChunks:\n${items
          .map(
            (item) =>
              `ID: ${item.id}\nText: ${item.text}\nBaseScore: ${item.score}`
          )
          .join("\n\n")}`
      }
    ],
    temperature: 0,
    max_tokens: config.rerankMaxTokens
  });

  const content = response.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);
  let rankings = [];
  if (Array.isArray(parsed)) {
    rankings = parsed;
  } else if (Array.isArray(parsed?.rankings)) {
    rankings = parsed.rankings;
  }

  const scoreMap = new Map();
  rankings.forEach((item) => {
    if (!item || item.id === undefined || item.id === null) {
      return;
    }
    const score = clamp(Number(item.relevance ?? item.score), 0, 1);
    scoreMap.set(String(item.id), score);
  });

  if (!scoreMap.size) {
    return results;
  }

  const reranked = subset
    .slice()
    .sort(
      (a, b) =>
        (scoreMap.get(getResultKey(b)) ?? -1) -
        (scoreMap.get(getResultKey(a)) ?? -1)
    )
    .map((item) => {
      item.rerankScore = scoreMap.get(getResultKey(item)) ?? null;
      return item;
    });

  return [...reranked, ...results.slice(take)];
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
    const embeddings = await embedTexts(batch.map((item) => item.text), config.embeddingPassageInputType);
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

export async function answerQuestion({ docId, question, options }) {
  if (!docId) {
    throw new Error("Missing docId");
  }
  if (!question || !question.trim()) {
    throw new Error("Missing question");
  }

  const trimmedQuestion = compactWhitespace(question);
  const cacheOptionsKey = options ? stableStringify(options) : "";
  const cacheSuffix = cacheOptionsKey
    ? `:${hashText(cacheOptionsKey)}`
    : "";
  const cacheKey = `${docId}:${trimmedQuestion.toLowerCase()}${cacheSuffix}`;
  const cached = answerCache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const corrective = resolveCorrectiveOptions(options);
  const maxRetries = corrective.enabled ? corrective.retries : 0;
  let finalAnswer = "";
  let finalCitations = [];
  let finalConfidence = null;
  let corrected = false;
  let usedRerank = false;
  let rewrittenQuery = null;
  let retriesUsed = 0;
  let mergedForRetry = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const isRetry = attempt > 0;
    const topK = isRetry ? corrective.expandedTopK : config.topK;
    let queries = [trimmedQuestion];

    if (isRetry) {
      const rewrites = await rewriteQueries(
        trimmedQuestion,
        corrective.rewriteCount
      );
      if (rewrites.length) {
        queries = rewrites;
        rewrittenQuery = rewrittenQuery || rewrites[0];
      }
    }

    queries = normalizeQueries(queries, trimmedQuestion);
    const retrieved = await retrieveForQueries(docId, queries, topK);
    let merged = mergeResults(retrieved);
    if (mergedForRetry && mergedForRetry.length) {
      merged = mergeResults([...mergedForRetry, ...merged]);
    }

    if (corrective.enabled && corrective.rerank && merged.length > 1) {
      merged = await rerankResults(
        trimmedQuestion,
        merged,
        corrective.rerankTopN,
        corrective.rerankChunkChars
      );
      usedRerank = true;
    }

    const { contextText, citations } = buildContext(merged);
    if (!contextText) {
      if (attempt < maxRetries) {
        mergedForRetry = merged;
        retriesUsed += 1;
        corrected = true;
        continue;
      }
      finalAnswer = "I could not find that in the document.";
      finalCitations = [];
      finalConfidence = 0;
      break;
    }

    const answer = await generateAnswer(trimmedQuestion, contextText);
    let judge = { confidence: null };
    if (corrective.enabled) {
      judge = await judgeAnswer({
        question: trimmedQuestion,
        answer,
        contextText
      });
    }

    let confidence = judge.confidence;
    const lowerAnswer = answer.toLowerCase();
    if (lowerAnswer.includes("could not find that in the document")) {
      confidence = Number.isFinite(confidence)
        ? Math.min(confidence, 0.2)
        : 0.2;
    }

    const shouldRetry =
      corrective.enabled &&
      attempt < maxRetries &&
      (!Number.isFinite(confidence) ||
        confidence < corrective.confidenceThreshold);

    if (shouldRetry) {
      mergedForRetry = merged;
      retriesUsed += 1;
      corrected = true;
      continue;
    }

    finalAnswer = answer || "No response generated.";
    finalCitations = citations;
    finalConfidence = Number.isFinite(confidence) ? confidence : null;
    break;
  }

  const result = {
    answer: finalAnswer || "No response generated.",
    citations: finalCitations,
    cached: false,
    correction: {
      enabled: corrective.enabled,
      corrected,
      retries: retriesUsed,
      maxRetries,
      confidence: finalConfidence,
      threshold: corrective.confidenceThreshold,
      usedRerank,
      rewrittenQuery
    }
  };

  answerCache.set(cacheKey, result);
  return result;
}
