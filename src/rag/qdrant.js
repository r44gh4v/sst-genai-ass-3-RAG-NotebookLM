import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config.js";

let client;
let payloadIndexReady = false;

export function getQdrantClient() {
  if (!client) {
    if (!config.qdrantUrl) {
      throw new Error("QDRANT_URL is missing.");
    }
    client = new QdrantClient({
      url: config.qdrantUrl,
      apiKey: config.qdrantApiKey || undefined
    });
  }
  return client;
}

export async function collectionExists() {
  const qdrant = getQdrantClient();
  const collections = await qdrant.getCollections();
  return collections.collections?.some(
    (collection) => collection.name === config.qdrantCollection
  );
}

export async function ensureCollection(vectorSize) {
  const qdrant = getQdrantClient();
  const exists = await collectionExists();
  if (exists) {
    await ensurePayloadIndex();
    return;
  }
  await qdrant.createCollection(config.qdrantCollection, {
    vectors: {
      size: vectorSize,
      distance: "Cosine"
    }
  });
  await ensurePayloadIndex();
}

export async function ensurePayloadIndex() {
  if (payloadIndexReady) {
    return;
  }
  const qdrant = getQdrantClient();
  const info = await qdrant.getCollection(config.qdrantCollection);
  const schema = info?.payload_schema || {};
  if (!schema.docId) {
    await qdrant.createPayloadIndex(config.qdrantCollection, {
      field_name: "docId",
      field_schema: "keyword"
    });
  }
  payloadIndexReady = true;
}

export async function countByDocId(docId) {
  const exists = await collectionExists();
  if (!exists) {
    return 0;
  }
  await ensurePayloadIndex();
  const qdrant = getQdrantClient();
  const result = await qdrant.count(config.qdrantCollection, {
    filter: {
      must: [{ key: "docId", match: { value: docId } }]
    },
    exact: true
  });
  return result.count || 0;
}

export async function upsertPoints(points) {
  if (!points.length) {
    return;
  }
  const qdrant = getQdrantClient();
  await qdrant.upsert(config.qdrantCollection, {
    points
  });
}

export async function searchByDocId(docId, vector, limit) {
  await ensurePayloadIndex();
  const qdrant = getQdrantClient();
  const results = await qdrant.search(config.qdrantCollection, {
    vector,
    limit,
    filter: {
      must: [{ key: "docId", match: { value: docId } }]
    },
    with_payload: true
  });
  return results;
}
