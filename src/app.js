import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { answerQuestion, indexDocument } from "./rag/rag.js";
import { answerCache } from "./rag/cache.js";

const app = express();
app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileMb * 1024 * 1024
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/cache/clear", (req, res) => {
  const size = answerCache.size;
  answerCache.clear();
  res.json({ cleared: size });
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const allowed = [
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel"
    ];
    if (!allowed.includes(file.mimetype)) {
      return res.status(400).json({
        error: "Only PDF, TXT, or CSV files are supported"
      });
    }

    const result = await indexDocument({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname
    });

    return res.json({
      docId: result.docId,
      chunks: result.chunks,
      reused: result.reused
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to index document"
    });
  }
});

app.post("/api/ask", async (req, res) => {
  try {
    const { docId, question, options } = req.body || {};
    const trimmed = String(question || "").trim();
    if (!docId || !trimmed) {
      return res.status(400).json({
        error: "docId and question are required"
      });
    }

    const safeOptions = options && typeof options === "object" ? options : undefined;
    const result = await answerQuestion({
      docId,
      question: trimmed,
      options: safeOptions
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to answer question"
    });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "../public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `File too large. Max ${config.maxFileMb}MB.`
    });
  }
  return res.status(500).json({
    error: "Unexpected server error"
  });
});

export default app;
