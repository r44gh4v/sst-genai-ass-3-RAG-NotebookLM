import { LRUCache } from "lru-cache";
import { config } from "../config.js";

export const answerCache = new LRUCache({
  max: config.cacheMax,
  ttl: config.cacheTtlMs
});
