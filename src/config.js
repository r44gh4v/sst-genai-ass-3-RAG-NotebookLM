import "dotenv/config";

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
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
