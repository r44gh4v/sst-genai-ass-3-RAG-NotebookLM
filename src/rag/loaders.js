import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import fs from "fs/promises";

export async function loadDocumentsFromFile(filePath, mimeType, originalName) {
  if (mimeType === "application/pdf") {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();
    return docs.map((doc, index) => ({
      text: doc.pageContent,
      page:
        doc.metadata?.loc?.pageNumber ||
        doc.metadata?.pageNumber ||
        index + 1,
      source: originalName
    }));
  }

  if (
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    const text = await fs.readFile(filePath, "utf8");
    const rows = parseCsv(text);
    if (!rows.length) {
      throw new Error("CSV file appears to be empty");
    }
    const header = rows[0];
    const bodyLines = rows.slice(1).map((row, index) =>
      formatCsvRow(header, row, index + 1)
    );
    const headerLine = `Header: ${header.join(" | ")}`;
    const csvText = [headerLine, ...bodyLines].join("\n");
    return [
      {
        text: csvText,
        page: 1,
        source: originalName
      }
    ];
  }

  if (mimeType === "text/plain" || mimeType.startsWith("text/")) {
    const text = await fs.readFile(filePath, "utf8");
    return [
      {
        text,
        page: 1,
        source: originalName
      }
    ];
  }

  throw new Error("Unsupported file type");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === "," || char === "\n" || char === "\r")) {
      row.push(cell);
      cell = "";

      if (char === "\n" || char === "\r") {
        if (char === "\r" && next === "\n") {
          i += 1;
        }
        if (row.some((value) => value.trim() !== "")) {
          rows.push(row);
        }
        row = [];
      }
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
  }
  if (row.length && row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows.map((rowValues) => rowValues.map((value) => value.trim()));
}

function formatCsvRow(header, row, index) {
  const parts = row.map((value, colIndex) => {
    const label = header[colIndex] || `col${colIndex + 1}`;
    return `${label}: ${value}`;
  });
  return `Row ${index}: ${parts.join(" | ")}`;
}
