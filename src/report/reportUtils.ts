export function labelFor(key: string): string {
  const labels: Record<string, string> = {
    static_analysis: 'Статический анализ',
    complexity: 'Сложность',
    test_coverage: 'Покрытие тестами',
    security: 'Безопасность',
    degradation: 'ML (деградация)',
  };
  return labels[key] ?? key;
}

export function shortenPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^.*\/(src|tests|test|lib|app)\//, '$1/');
}

export function scoreColor(score: number): string {
  if (score >= 80) return '#00ff88';
  if (score >= 60) return '#ffcc00';
  return '#ff3366';
}

export function severityBadgeClass(severity: string): string {
  switch (severity) {
    case 'critical': return 'sev-critical';
    case 'high': return 'sev-high';
    case 'moderate': return 'sev-moderate';
    default: return 'sev-low';
  }
}

export function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdownInline(text: string): string {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map(part => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return `<code class="md-inline">${escapeHtml(part.slice(1, -1))}</code>`;
    }
    return escapeHtml(part);
  }).join('');
}

export function renderMarkdownParagraphs(text: string): string {
  const lines = text.split('\n');
  const parts: string[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) return;
    const content = paragraphLines.map(line => renderMarkdownInline(line)).join('<br>');
    parts.push(`<p class="llm-review-p">${content}</p>`);
    paragraphLines = [];
  };

  const flushList = (): void => {
    if (listItems.length === 0) return;
    parts.push(
      `<ul class="llm-review-ul">${listItems.map(item =>
        `<li>${renderMarkdownInline(item)}</li>`).join('')}</ul>`,
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushList();
      flushParagraph();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      flushParagraph();
      const level = headingMatch[1].length;
      const tag = level <= 4 ? 'h4' : 'h5';
      parts.push(`<${tag} class="llm-review-h">${renderMarkdownInline(headingMatch[2])}</${tag}>`);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      listItems.push(bulletMatch[1]);
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushList();
  flushParagraph();
  return parts.join('');
}

export function sectionWarning(errMsg?: string | null): string {
  if (!errMsg) return '';
  return `<div class="tool-warning">
        <span class="warn-icon">⚠</span>
        Результат данного раздела может быть искажён из-за ошибки настройки окружения.
        Рекомендуется проверить конфигурацию инструментов и повторить анализ.
      </div>`;
}
