import "dotenv/config";
import { readFileSync } from "node:fs";

const appConfig = JSON.parse(
  readFileSync(new URL("../app.config.json", import.meta.url), "utf8")
);

// Secrets come from .env; everything else from app.config.json.
export const config = {
  port: appConfig.server.port,

  chatApiKey: process.env.CHAT_API_KEY || "",
  chatBaseUrl: appConfig.chat.baseUrl,
  chatModel: appConfig.chat.model,

  embeddingApiKey: process.env.EMBEDDING_API_KEY || "",
  embeddingBaseUrl: appConfig.embedding.baseUrl,
  embeddingModel: appConfig.embedding.model,
  embeddingPassageInputType: appConfig.embedding.passageInputType || null,
  embeddingQueryInputType: appConfig.embedding.queryInputType || null,

  judgeApiKey: process.env.JUDGE_API_KEY || "",
  judgeBaseUrl: appConfig.judge.baseUrl,
  judgeModel: appConfig.judge.model,
  judgeMaxTokens: appConfig.judge.maxTokens,

  rewriteApiKey: process.env.REWRITE_API_KEY || "",
  rewriteBaseUrl: appConfig.rewrite.baseUrl,
  rewriteModel: appConfig.rewrite.model,
  rewriteMaxTokens: appConfig.rewrite.maxTokens,

  rerankApiKey: process.env.RERANK_API_KEY || "",
  rerankBaseUrl: appConfig.rerank.baseUrl,
  rerankModel: appConfig.rerank.model,
  rerankMaxTokens: appConfig.rerank.maxTokens,

  qdrantUrl: process.env.QDRANT_URL || "",
  qdrantApiKey: process.env.QDRANT_API_KEY || "",
  qdrantCollection: appConfig.qdrant.collection,

  chunkSize: appConfig.rag.chunkSize,
  chunkOverlap: appConfig.rag.chunkOverlap,
  maxChunks: appConfig.rag.maxChunks,
  embeddingBatchSize: appConfig.rag.embeddingBatchSize,
  topK: appConfig.rag.topK,
  maxContextChars: appConfig.rag.maxContextChars,
  maxChunkChars: appConfig.rag.maxChunkChars,
  maxOutputTokens: appConfig.rag.maxOutputTokens,

  correctiveEnabled: appConfig.corrective.enabled,
  correctiveRetries: appConfig.corrective.retries,
  correctiveConfidenceThreshold: appConfig.corrective.confidenceThreshold,
  correctiveTopK: appConfig.corrective.topK,
  correctiveRewriteCount: appConfig.corrective.rewriteCount,
  correctiveRerank: appConfig.corrective.rerank,
  rerankTopN: appConfig.corrective.rerankTopN,
  rerankChunkChars: appConfig.corrective.rerankChunkChars,

  cacheTtlMs: appConfig.cache.ttlMs,
  cacheMax: appConfig.cache.max,
  maxFileMb: appConfig.upload.maxFileMb
};

export const resolveChatConfig = () => ({
  apiKey: config.chatApiKey,
  baseURL: config.chatBaseUrl
});

// Embeddings use a different provider (Gemini), so no fallback to the chat key.
export const resolveEmbeddingConfig = () => ({
  apiKey: config.embeddingApiKey,
  baseURL: config.embeddingBaseUrl
});

export const resolveJudgeConfig = () => ({
  apiKey: config.judgeApiKey || config.chatApiKey,
  baseURL: config.judgeBaseUrl || config.chatBaseUrl
});

export const resolveRewriteConfig = () => ({
  apiKey: config.rewriteApiKey || config.chatApiKey,
  baseURL: config.rewriteBaseUrl || config.chatBaseUrl
});

export const resolveRerankConfig = () => ({
  apiKey: config.rerankApiKey || config.chatApiKey,
  baseURL: config.rerankBaseUrl || config.chatBaseUrl
});
