import "dotenv/config";

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: toInt(process.env.PORT, 3000),
  chatApiKey:
    process.env.CHAT_API_KEY || process.env.OPENAI_API_KEY || "",
  chatBaseUrl:
    process.env.CHAT_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta/openai/",
  chatModel: process.env.CHAT_MODEL || "gemini-1.5-flash",
  embeddingApiKey: process.env.EMBEDDING_API_KEY || "",
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL || "",
  embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-004",
  embeddingPassageInputType: process.env.EMBEDDING_PASSAGE_INPUT_TYPE || null,
  embeddingQueryInputType: process.env.EMBEDDING_QUERY_INPUT_TYPE || null,
  judgeApiKey: process.env.JUDGE_API_KEY || "",
  judgeBaseUrl: process.env.JUDGE_BASE_URL || "",
  judgeModel: process.env.JUDGE_MODEL || "gemini-1.5-flash",
  judgeMaxTokens: toInt(process.env.JUDGE_MAX_TOKENS, 300),
  rewriteApiKey: process.env.REWRITE_API_KEY || "",
  rewriteBaseUrl: process.env.REWRITE_BASE_URL || "",
  rewriteModel: process.env.REWRITE_MODEL || "gemini-1.5-flash",
  rewriteMaxTokens: toInt(process.env.REWRITE_MAX_TOKENS, 200),
  rerankApiKey: process.env.RERANK_API_KEY || "",
  rerankBaseUrl: process.env.RERANK_BASE_URL || "",
  rerankModel: process.env.RERANK_MODEL || "gemini-1.5-flash",
  rerankMaxTokens: toInt(process.env.RERANK_MAX_TOKENS, 400),
  qdrantUrl: process.env.QDRANT_URL || "",
  qdrantApiKey: process.env.QDRANT_API_KEY || "",
  qdrantCollection: process.env.QDRANT_COLLECTION || "notebooklm_rag",
  chunkSize: toInt(process.env.CHUNK_SIZE, 900),
  chunkOverlap: toInt(process.env.CHUNK_OVERLAP, 150),
  maxChunks: toInt(process.env.MAX_CHUNKS, 300),
  embeddingBatchSize: toInt(process.env.EMBEDDING_BATCH_SIZE, 32),
  topK: toInt(process.env.TOP_K, 5),
  maxContextChars: toInt(process.env.MAX_CONTEXT_CHARS, 8000),
  maxChunkChars: toInt(process.env.MAX_CHUNK_CHARS, 2000),
  maxOutputTokens: toInt(process.env.MAX_OUTPUT_TOKENS, 4000),
  correctiveEnabled: process.env.CORRECTIVE_RAG_ENABLED !== "false",
  correctiveRetries: toInt(process.env.CORRECTIVE_RETRIES, 1),
  correctiveConfidenceThreshold: toFloat(
    process.env.CORRECTIVE_CONFIDENCE_THRESHOLD,
    0.55
  ),
  correctiveTopK: toInt(process.env.CORRECTIVE_TOP_K, 10),
  correctiveRewriteCount: toInt(process.env.CORRECTIVE_REWRITE_COUNT, 1),
  correctiveRerank: process.env.CORRECTIVE_RERANK !== "false",
  rerankTopN: toInt(process.env.RERANK_TOP_N, 8),
  rerankChunkChars: toInt(process.env.RERANK_CHUNK_CHARS, 600),
  cacheTtlMs: toInt(process.env.CACHE_TTL_MS, 600000),
  cacheMax: toInt(process.env.CACHE_MAX, 100),
  maxFileMb: toInt(process.env.MAX_FILE_MB, 5)
};

export const resolveChatConfig = () => ({
  apiKey: config.chatApiKey,
  baseURL: config.chatBaseUrl
});

export const resolveEmbeddingConfig = () => ({
  apiKey: config.embeddingApiKey || config.chatApiKey,
  baseURL: config.embeddingBaseUrl || config.chatBaseUrl
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
