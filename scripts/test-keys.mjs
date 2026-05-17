import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

// Parse .env manually
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const ok = (label) => console.log(`  [PASS] ${label}`);
const fail = (label, msg) => console.log(`  [FAIL] ${label}: ${msg}`);

async function testChat() {
  const label = `CHAT  | ${env.CHAT_MODEL} @ ${env.CHAT_BASE_URL}`;
  try {
    const res = await fetch(`${env.CHAT_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CHAT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.CHAT_MODEL,
        messages: [{ role: "user", content: "Say hi." }],
        max_tokens: 10,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? data.error?.code ?? JSON.stringify(data));
    ok(label);
  } catch (e) {
    fail(label, e.message);
  }
}

async function testEmbedding() {
  const label = `EMBED | ${env.EMBEDDING_MODEL} @ ${env.EMBEDDING_BASE_URL}`;
  try {
    const res = await fetch(`${env.EMBEDDING_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EMBEDDING_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.EMBEDDING_MODEL,
        input: ["test"],
        input_type: "query",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? JSON.stringify(data));
    const dim = data.data?.[0]?.embedding?.length ?? "?";
    ok(`${label} (dim=${dim})`);
  } catch (e) {
    fail(label, e.message);
  }
}

async function testJudge() {
  const label = `JUDGE | ${env.JUDGE_MODEL} @ ${env.JUDGE_BASE_URL}`;
  try {
    const res = await fetch(`${env.JUDGE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.JUDGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.JUDGE_MODEL,
        messages: [{ role: "user", content: "Say hi." }],
        max_tokens: 10,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? JSON.stringify(data));
    ok(label);
  } catch (e) {
    fail(label, e.message);
  }
}

async function testRewrite() {
  const label = `REWRITE | ${env.REWRITE_MODEL} @ ${env.REWRITE_BASE_URL}`;
  try {
    const res = await fetch(`${env.REWRITE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.REWRITE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.REWRITE_MODEL,
        messages: [{ role: "user", content: "Say hi." }],
        max_tokens: 10,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? JSON.stringify(data));
    ok(label);
  } catch (e) {
    fail(label, e.message);
  }
}

async function testRerank() {
  const label = `RERANK | ${env.RERANK_MODEL} @ ${env.RERANK_BASE_URL}`;
  try {
    const res = await fetch(`${env.RERANK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RERANK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.RERANK_MODEL,
        messages: [{ role: "user", content: "Say hi." }],
        max_tokens: 10,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? JSON.stringify(data));
    ok(label);
  } catch (e) {
    fail(label, e.message);
  }
}

async function testQdrant() {
  const label = `QDRANT | ${env.QDRANT_URL}`;
  try {
    const res = await fetch(`${env.QDRANT_URL}/collections/${env.QDRANT_COLLECTION}`, {
      headers: { "api-key": env.QDRANT_API_KEY },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.status?.error ?? JSON.stringify(data));
    const count = data.result?.vectors_count ?? "?";
    ok(`${label} (vectors=${count})`);
  } catch (e) {
    fail(label, e.message);
  }
}

console.log("\nTesting all keys...\n");

// CHAT, JUDGE, REWRITE, RERANK share the same OpenRouter key — run in parallel
// EMBEDDING (NVIDIA) and QDRANT are independent too
await Promise.all([
  testChat(),
  testJudge(),
  testRewrite(),
  testRerank(),
  testEmbedding(),
  testQdrant(),
]);

console.log("\nDone.\n");
