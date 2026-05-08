export function chunkText(text, options) {
  const chunkSize = Math.max(options.chunkSize || 900, 200);
  const overlap = Math.min(
    Math.max(options.chunkOverlap || 150, 0),
    chunkSize - 50
  );
  const maxChunks = Math.max(options.maxChunks || 300, 1);
  const cleaned = String(text || "").replace(/\r/g, "");
  const chunks = [];
  let start = 0;

  while (start < cleaned.length && chunks.length < maxChunks) {
    let end = Math.min(start + chunkSize, cleaned.length);
    let slice = cleaned.slice(start, end);

    if (end < cleaned.length) {
      const breakIndex = findBreakIndex(slice);
      if (breakIndex > Math.floor(chunkSize * 0.6)) {
        end = start + breakIndex;
        slice = cleaned.slice(start, end);
      }
    }

    const trimmed = slice.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }

    if (end >= cleaned.length) {
      break;
    }

    const nextStart = end - overlap;
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
  }

  return chunks;
}

function findBreakIndex(text) {
  const breakpoints = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", "];
  let best = -1;
  for (const point of breakpoints) {
    const index = text.lastIndexOf(point);
    if (index > best) {
      best = index + point.length;
    }
  }
  return best;
}
