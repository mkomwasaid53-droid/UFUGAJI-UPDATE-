/**
 * ============================================================================
 * V1.1 IMAGE FOUNDATION — FROZEN AFTER V1.1.7
 * PROJECT: UFUGAJI UPDATE
 * STAGE: IMAGE_RENDERING (Text Response Presentation)
 * 
 * INVARIANT:
 * - Formats observation notes, disclaimers, and sections faithfully.
 * - Does not modify, strip, or alter any safety wording or model output.
 * ============================================================================
 */
import React from 'react';

interface AiMessageContentProps {
  content: string;
  isUser: boolean;
}

/**
 * Helper to parse inline formatting such as **bold** and *italic*
 * without modifying any of the original words.
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  // Matches **bold** or *italic*
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-semibold text-inherit">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} className="italic text-inherit">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export const AiMessageContent: React.FC<AiMessageContentProps> = ({ content, isUser }) => {
  if (isUser) {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  // Split into paragraphs/blocks by double newline
  const blocks = content.split(/\n\s*\n/);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-stone-900">
      {blocks.map((block, bIdx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Visual observation section (starts with 📷 or discusses image observations)
        const isVisualObservation =
          trimmed.startsWith('📷') ||
          trimmed.startsWith('🔍') ||
          trimmed.toLowerCase().startsWith('kuhusu picha') ||
          trimmed.toLowerCase().startsWith('katika picha hii');

        // Professional veterinary disclaimer / advisory reminder (starts with ⚠️ or 🩺 or mentions Bwana Mifugo)
        const isDisclaimer =
          trimmed.startsWith('⚠️') ||
          trimmed.startsWith('🩺') ||
          trimmed.toLowerCase().includes('bwana mifugo wa eneo lako') ||
          trimmed.toLowerCase().includes('kikumbusho cha kitaalamu:');

        // Check for bullet list block
        const lines = trimmed.split('\n');
        const isList = lines.every((line) => {
          const l = line.trim();
          return l.startsWith('•') || l.startsWith('- ') || l.startsWith('* ') || /^\d+\.\s/.test(l);
        });

        if (isList) {
          return (
            <ul key={bIdx} className="space-y-1.5 my-1.5 pl-1">
              {lines.map((line, lIdx) => {
                const l = line.trim();
                const cleanLine = l.replace(/^([•\-\*]|\d+\.)\s*/, '');
                return (
                  <li key={lIdx} className="flex items-start space-x-2 text-[13px] sm:text-sm">
                    <span className="text-emerald-700 font-bold shrink-0 mt-0.5">•</span>
                    <span className="flex-1">{renderInlineFormatting(cleanLine)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        if (isVisualObservation) {
          return (
            <div
              key={bIdx}
              className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/90 text-stone-900 text-[13px] sm:text-sm shadow-2xs"
            >
              {lines.map((line, lIdx) => (
                <p key={lIdx} className={lIdx > 0 ? 'mt-1.5' : ''}>
                  {renderInlineFormatting(line)}
                </p>
              ))}
            </div>
          );
        }

        if (isDisclaimer) {
          return (
            <div
              key={bIdx}
              className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 text-[12px] sm:text-[13px] shadow-2xs"
            >
              {lines.map((line, lIdx) => (
                <p key={lIdx} className={lIdx > 0 ? 'mt-1' : ''}>
                  {renderInlineFormatting(line)}
                </p>
              ))}
            </div>
          );
        }

        // Standard paragraph
        return (
          <p key={bIdx} className="text-stone-800">
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {renderInlineFormatting(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};
