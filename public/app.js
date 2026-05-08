const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("file-input");
const fileName = document.getElementById("file-name");
const uploadStatus = document.getElementById("upload-status");
const docIdEl = document.getElementById("doc-id");
const chatLog = document.getElementById("chat-log");
const askForm = document.getElementById("ask-form");
const questionInput = document.getElementById("question-input");

const MAX_FILE_MB = 5;

let currentDocId = null;

function setStatus(message, isError = false) {
  uploadStatus.textContent = message;
  uploadStatus.style.color = isError ? "#b24a2f" : "";
}

function renderSources(wrapper, sources) {
  const existing = wrapper.querySelector(".sources");
  if (existing) {
    existing.remove();
  }
  if (!sources || !sources.length) {
    return;
  }
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

function appendMessage(role, text, sources, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  if (options.pending) {
    wrapper.classList.add("pending");
  }
  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = text;
  wrapper.appendChild(content);
  renderSources(wrapper, sources);

  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;
  return wrapper;
}

function updateMessage(wrapper, text, sources) {
  if (!wrapper) {
    return;
  }
  const content = wrapper.querySelector(".message-content");
  if (content) {
    content.textContent = text;
  }
  renderSources(wrapper, sources);
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
    setStatus(`File too large. Max ${MAX_FILE_MB} MB.`, true);
    fileInput.value = "";
    fileName.textContent = "No file selected";
    return;
  }
  fileName.textContent = `${file.name} (${sizeMb.toFixed(2)} MB)`;
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file) {
    setStatus("Select a PDF or text file first.", true);
    return;
  }

  setStatus("Indexing document...");
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Upload failed");
    }
    currentDocId = data.docId;
    docIdEl.textContent = currentDocId;
    const note = data.reused
      ? "Document already indexed."
      : `Indexed ${data.chunks} chunks.`;
    setStatus(note);
    appendMessage(
      "assistant",
      "Ready. Ask a question about the document when you are ready."
    );
  } catch (error) {
    setStatus(error.message, true);
  }
});

askForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) {
    return;
  }
  if (!currentDocId) {
    appendMessage("assistant", "Upload a document first.");
    return;
  }

  appendMessage("user", question);
  questionInput.value = "";
  const pending = appendMessage("assistant", "Thinking...", null, {
    pending: true
  });

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        docId: currentDocId,
        question
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to answer");
    }
    updateMessage(pending, data.answer, data.citations);
  } catch (error) {
    updateMessage(pending, error.message);
  }
});
