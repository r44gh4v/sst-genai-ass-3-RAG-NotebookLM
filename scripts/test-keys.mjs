import {
  config,
  resolveChatConfig,
  resolveJudgeConfig,
  resolveRewriteConfig,
  resolveRerankConfig,
} from "../src/config.js";
import { embedQuery } from "../src/rag/openai.js";

const ok = (label) => console.log(`  [PASS] ${label}`);
const fail = (label, msg) => console.log(`  [FAIL] ${label}: ${msg}`);

async function testCompletion(name, model, { apiKey, baseURL }) {
  const label = `${name} | ${model} @ ${baseURL}`;
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say hi." }],
        max_tokens: 10,
      }),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(
        data.error?.message ?? data.error?.code ?? JSON.stringify(data)
      );
    ok(label);
  } catch (e) {
    fail(label, e.message);
  }
}

async function testEmbedding() {
  const label = `EMBED | ${config.embeddingModel} @ ${config.embeddingBaseUrl}`;
  try {
    const vector = await embedQuery("test");
    const dim = Array.isArray(vector) ? vector.length : "?";
    ok(`${label} (dim=${dim})`);
  } catch (e) {
    fail(label, e.message);
  }
}

async function testQdrant() {
  const label = `QDRANT | ${config.qdrantUrl}`;
  try {
    const res = await fetch(
      `${config.qdrantUrl}/collections/${config.qdrantCollection}`,
      { headers: { "api-key": config.qdrantApiKey } }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.status?.error ?? JSON.stringify(data));
    const count = data.result?.vectors_count ?? "?";
    ok(`${label} (vectors=${count})`);
  } catch (e) {
    fail(label, e.message);
  }
}

console.log("\nTesting all keys...\n");

await Promise.all([
  testCompletion("CHAT", config.chatModel, resolveChatConfig()),
  testCompletion("JUDGE", config.judgeModel, resolveJudgeConfig()),
  testCompletion("REWRITE", config.rewriteModel, resolveRewriteConfig()),
  testCompletion("RERANK", config.rerankModel, resolveRerankConfig()),
  testEmbedding(),
  testQdrant(),
]);

console.log("\nDone.\n");
