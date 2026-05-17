const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("file-input");
const fileName = document.getElementById("file-name");
const docIdEl = document.getElementById("doc-id");
const chatLog = document.getElementById("chat-log");
const askForm = document.getElementById("ask-form");
const questionInput = document.getElementById("question-input");
const activityLog = document.getElementById("activity-log");
const chatSubheading = document.getElementById("chat-subheading");

const MAX_FILE_MB = 5;

let currentDocId = null;

function logActivity(message, type = "info") {
  const idle = activityLog.querySelector(".log-idle");
  if (idle) idle.remove();

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const entry = document.createElement("div");
  entry.className = `log-entry log-${type}`;

  const timeEl = document.createElement("span");
  timeEl.className = "log-time";
  timeEl.textContent = timeStr;

  const msgEl = document.createElement("span");
  msgEl.textContent = message;

  entry.appendChild(timeEl);
  entry.appendChild(msgEl);
  activityLog.appendChild(entry);
  activityLog.scrollTop = activityLog.scrollHeight;

  const entries = activityLog.querySelectorAll(".log-entry");
  if (entries.length > 60) {
    entries[0].remove();
  }
}

function renderSources(wrapper, sources) {
  const existing = wrapper.querySelector(".sources");
  if (existing) existing.remove();
  if (!sources || !sources.length) return;

  const sourceEl = document.createElement("div");
  sourceEl.className = "sources";
  const formatted = sources
    .map((source) => {
      const page = source.page ? `p${source.page}` : "p?";
      return `[${source.index}] ${page}`;
    })
    .join(" ");
  sourceEl.textContent = `Sources: ${formatted}`;
  wrapper.appendChild(sourceEl);
}

function renderMeta(wrapper, correction) {
  const existing = wrapper.querySelector(".meta");
  if (existing) existing.remove();
  if (!correction || correction.enabled === false) return;

  const parts = [];
  if (typeof correction.confidence === "number") {
    parts.push(`Confidence: ${correction.confidence.toFixed(2)}`);
  }
  if (typeof correction.threshold === "number") {
    parts.push(`Threshold: ${correction.threshold.toFixed(2)}`);
  }
  parts.push(`Corrected: ${correction.corrected ? "yes" : "no"}`);
  if (
    typeof correction.retries === "number" &&
    typeof correction.maxRetries === "number"
  ) {
    parts.push(`Retries: ${correction.retries}/${correction.maxRetries}`);
  }
  if (typeof correction.usedRerank === "boolean") {
    parts.push(`Rerank: ${correction.usedRerank ? "yes" : "no"}`);
  }
  if (correction.rewrittenQuery) {
    const shortened = correction.rewrittenQuery.slice(0, 140);
    parts.push(`Rewrite: ${shortened}`);
  }
  if (!parts.length) return;

  const metaEl = document.createElement("div");
  metaEl.className = "meta";
  metaEl.textContent = parts.join(" | ");
  wrapper.appendChild(metaEl);
}

function appendMessage(role, text, sources, options = {}) {
  const emptyState = chatLog.querySelector(".chat-empty");
  if (emptyState) emptyState.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  if (options.pending) wrapper.classList.add("pending");

  if (role === "assistant") {
    const roleLabel = document.createElement("span");
    roleLabel.className = "message-role";
    roleLabel.textContent = "Assistant";
    wrapper.appendChild(roleLabel);
  }

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;
  wrapper.appendChild(bubble);

  renderSources(wrapper, sources);
  renderMeta(wrapper, options.correction);

  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;
  return wrapper;
}

function updateMessage(wrapper, text, sources, correction) {
  if (!wrapper) return;
  const bubble = wrapper.querySelector(".message-bubble");
  if (bubble) bubble.textContent = text;
  renderSources(wrapper, sources);
  renderMeta(wrapper, correction);
  wrapper.classList.remove("pending");
  chatLog.scrollTop = chatLog.scrollHeight;
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) {
    fileName.textContent = "No file selected";
    return;
  }
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_FILE_MB) {
    logActivity(`File too large. Max ${MAX_FILE_MB} MB.`, "error");
    fileInput.value = "";
    fileName.textContent = "No file selected";
    return;
  }
  fileName.textContent = `${file.name} (${sizeMb.toFixed(2)} MB)`;
  logActivity(`File selected: ${file.name}`, "info");
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file) {
    logActivity("Select a PDF, TXT, or CSV file first.", "error");
    return;
  }

  logActivity("Uploading and indexing document...", "info");
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed");

    currentDocId = data.docId;
    docIdEl.textContent = currentDocId;

    if (data.reused) {
      logActivity("Document already indexed (cache reused).", "success");
    } else {
      logActivity(`Indexed ${data.chunks} chunks successfully.`, "success");
    }

    chatSubheading.textContent = "Document ready — ask away";
    appendMessage(
      "assistant",
      "Ready. Ask a question about the document when you are ready."
    );
  } catch (error) {
    logActivity(`Upload error: ${error.message}`, "error");
  }
});

askForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;
  if (!currentDocId) {
    appendMessage("assistant", "Upload a document first.");
    return;
  }

  appendMessage("user", question);
  questionInput.value = "";

  const shortened =
    question.length > 60 ? question.slice(0, 60) + "…" : question;
  logActivity(`Question: “${shortened}”`, "info");
  logActivity("Searching document chunks...", "step");

  const pending = appendMessage("assistant", "Thinking...", null, {
    pending: true,
  });

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId: currentDocId, question }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to answer");

    updateMessage(pending, data.answer, data.citations, data.correction);

    if (data.correction) {
      const c = data.correction;
      if (c.rewrittenQuery) {
        logActivity(
          `Query rewritten: “${c.rewrittenQuery.slice(0, 80)}”`,
          "pipeline"
        );
      }
      if (typeof c.usedRerank === "boolean") {
        logActivity(`Reranking: ${c.usedRerank ? "applied" : "skipped"}`, "pipeline");
      }
      if (typeof c.confidence === "number") {
        const thr =
          typeof c.threshold === "number"
            ? ` (threshold ${c.threshold.toFixed(2)})`
            : "";
        logActivity(`Confidence: ${c.confidence.toFixed(2)}${thr}`, "pipeline");
      }
      if (c.corrected) {
        logActivity(
          `Answer corrected after ${c.retries}/${c.maxRetries} retries`,
          "pipeline"
        );
      }
    }

    logActivity("Answer ready.", "success");
  } catch (error) {
    updateMessage(pending, error.message);
    logActivity(`Error: ${error.message}`, "error");
  }
});
