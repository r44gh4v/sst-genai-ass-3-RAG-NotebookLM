import OpenAI from "openai";
import {
  config,
  resolveChatConfig,
  resolveEmbeddingConfig
} from "../config.js";

const chatConfig = resolveChatConfig();
const embeddingConfig = resolveEmbeddingConfig();

const chatClient = new OpenAI({
  apiKey: chatConfig.apiKey,
  baseURL: chatConfig.baseURL
});

const embeddingClient = new OpenAI({
  apiKey: embeddingConfig.apiKey,
  baseURL: embeddingConfig.baseURL
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

export async function embedTexts(texts) {
  assertKey(embeddingConfig.apiKey, "EMBEDDING_API_KEY or CHAT_API_KEY");
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }
  const response = await embeddingClient.embeddings.create({
    model: config.embeddingModel,
    input: texts
  });
  return response.data.map((item) => item.embedding);
}

export async function embedQuery(text) {
  const vectors = await embedTexts([text]);
  return vectors[0];
}
