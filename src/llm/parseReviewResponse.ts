const MODEL_META_ADVICE_RE =
  /(?:catboost|onnx|ml[\s-]?модел|модел[ьи]\s+деградац|переобуч|train_target|архитектур[аы]\s+модел|качеств[оа]\s+модел)/i;

const REC_HEADER_RE = /(?:^|\n)\s*(?:#{1,6}\s*)?Рекомендации\s*:?\s*(?:\n|$)/i;
const REVIEW_HEADER_RE = /(?:^|\n)\s*(?:#{1,6}\s*)?Рецензия\s*:?\s*(?:\n|$)/i;

const NOISE_LINE_RE =
  /^@(param|returns|throws|type|example)\b|^\/\*\*|^\*\/|^\*\s|^Adds\s+\w/i;

function isModelMetaAdvice(text: string): boolean {
  return MODEL_META_ADVICE_RE.test(text);
}

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || NOISE_LINE_RE.test(trimmed);
}

function filterModelMetaAdvice(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p && !isModelMetaAdvice(p))
    .join('\n\n');
}

function stripSectionHeader(text: string, headerRe: RegExp): string {
  return text.replace(headerRe, '\n').trim();
}

function extractRecommendationItems(text: string): string[] {
  const items: string[] = [];
  let current: string | null = null;

  const pushCurrent = (): void => {
    if (!current) return;
    const normalized = current.replace(/\s+/g, ' ').trim();
    if (normalized.length > 10 && !isModelMetaAdvice(normalized) && !NOISE_LINE_RE.test(normalized)) {
      items.push(normalized);
    }
    current = null;
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || isNoiseLine(line)) {
      pushCurrent();
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      pushCurrent();
      current = bullet[1];
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      pushCurrent();
      current = numbered[1];
      continue;
    }

    const labeled = line.match(/^([A-Za-zА-Яа-яЁё0-9][^:]{1,80}):\s*(.+)$/);
    if (labeled && !/^https?:$/i.test(labeled[1])) {
      pushCurrent();
      current = `${labeled[1].trim()}: ${labeled[2].trim()}`;
      continue;
    }

    if (current) {
      current += ` ${line}`;
    }
  }

  pushCurrent();
  return items.slice(0, 7);
}

function splitReviewAndRecommendations(raw: string): { review: string; recommendations: string[] } {
  const trimmed = raw.trim();
  const recMatch = trimmed.match(REC_HEADER_RE);

  if (recMatch && recMatch.index !== undefined) {
    const review = stripSectionHeader(
      trimmed.slice(0, recMatch.index).trim(),
      REVIEW_HEADER_RE,
    );
    const recBody = trimmed
      .slice(recMatch.index + recMatch[0].length)
      .replace(REC_HEADER_RE, '')
      .trim();
    return {
      review: filterModelMetaAdvice(review),
      recommendations: extractRecommendationItems(recBody).filter(r => !isModelMetaAdvice(r)),
    };
  }

  const lines = trimmed.split('\n');
  const labeledIndexes = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => /^[-*•]\s+\S/.test(line) || /^\d+[.)]\s+\S/.test(line))
    .map(({ index }) => index);

  const bulletStart = labeledIndexes.find(index => index > lines.length / 3);
  if (bulletStart !== undefined) {
    return {
      review: filterModelMetaAdvice(
        stripSectionHeader(lines.slice(0, bulletStart).join('\n').trim(), REVIEW_HEADER_RE),
      ),
      recommendations: extractRecommendationItems(lines.slice(bulletStart).join('\n'))
        .filter(r => !isModelMetaAdvice(r)),
    };
  }

  const labeledStart = lines.findIndex((line, index) =>
    index > lines.length / 3 &&
    /^[A-Za-zА-Яа-яЁё][^:]{2,60}:\s+\S/.test(line.trim()),
  );
  if (labeledStart >= 0) {
    return {
      review: filterModelMetaAdvice(
        stripSectionHeader(lines.slice(0, labeledStart).join('\n').trim(), REVIEW_HEADER_RE),
      ),
      recommendations: extractRecommendationItems(lines.slice(labeledStart).join('\n'))
        .filter(r => !isModelMetaAdvice(r)),
    };
  }

  return {
    review: filterModelMetaAdvice(stripSectionHeader(trimmed, REVIEW_HEADER_RE)),
    recommendations: [],
  };
}

export function parseReviewResponse(raw: string): { review: string; recommendations: string[] } {
  return splitReviewAndRecommendations(raw);
}
