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
