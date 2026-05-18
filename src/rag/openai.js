import OpenAI from "openai";
import {
  config,
  resolveChatConfig,
  resolveEmbeddingConfig,
  resolveJudgeConfig,
  resolveRewriteConfig,
  resolveRerankConfig
} from "../config.js";

const chatConfig = resolveChatConfig();
const embeddingConfig = resolveEmbeddingConfig();
const judgeConfig = resolveJudgeConfig();
const rewriteConfig = resolveRewriteConfig();
const rerankConfig = resolveRerankConfig();

const chatClient = new OpenAI({
  apiKey: chatConfig.apiKey,
  baseURL: chatConfig.baseURL
});

const embeddingClient = new OpenAI({
  apiKey: embeddingConfig.apiKey,
  baseURL: embeddingConfig.baseURL
});

const judgeClient = new OpenAI({
  apiKey: judgeConfig.apiKey,
  baseURL: judgeConfig.baseURL
});

const rewriteClient = new OpenAI({
  apiKey: rewriteConfig.apiKey,
  baseURL: rewriteConfig.baseURL
});

const rerankClient = new OpenAI({
  apiKey: rerankConfig.apiKey,
  baseURL: rerankConfig.baseURL
});

function assertKey(apiKey, label) {
  if (!apiKey) {
    throw new Error(`${label} is missing. Set it in your environment.`);
  }
}

export function getChatClient() {
  assertKey(chatConfig.apiKey, "CHAT_API_KEY");
  return chatClient;
}

export function getJudgeClient() {
  assertKey(judgeConfig.apiKey, "JUDGE_API_KEY or CHAT_API_KEY");
  return judgeClient;
}

export function getRewriteClient() {
  assertKey(rewriteConfig.apiKey, "REWRITE_API_KEY or CHAT_API_KEY");
  return rewriteClient;
}

export function getRerankClient() {
  assertKey(rerankConfig.apiKey, "RERANK_API_KEY or CHAT_API_KEY");
  return rerankClient;
}

export async function embedTexts(texts, inputType) {
  assertKey(embeddingConfig.apiKey, "EMBEDDING_API_KEY (Google Gemini key)");
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }
  const params = { model: config.embeddingModel, input: texts };
  if (inputType) params.input_type = inputType;
  const response = await embeddingClient.embeddings.create(params);
  return response.data.map((item) => item.embedding);
}

export async function embedQuery(text) {
  const vectors = await embedTexts([text], config.embeddingQueryInputType);
  return vectors[0];
}
