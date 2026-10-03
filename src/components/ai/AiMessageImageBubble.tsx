/**
 * ============================================================================
 * V1.1 IMAGE FOUNDATION — FROZEN AFTER V1.1.7
 * PROJECT: UFUGAJI UPDATE
 * STAGE: IMAGE_RENDERING (Chat Bubble & Lightbox) & IMAGE_PERSISTENCE_METADATA
 * 
 * INVARIANT:
 * - Displays local blob preview only while active in memory during the current session.
 * - For historical sessions, safely and honestly falls back to safe metadata-only card.
 * - No raw bytes or base64 data are stored or expected.
 * ============================================================================
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Image as ImageIcon, ImageOff, Shield, ZoomIn, X } from 'lucide-react';
import { AiImageAttachment } from '../../types';

interface AiMessageImageBubbleProps {
  attachment: AiImageAttachment;
  isUser: boolean;
  activeBlobUrls?: Set<string>;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AiMessageImageBubble: React.FC<AiMessageImageBubbleProps> = ({
  attachment,
  isUser,
  activeBlobUrls,
}) => {
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isFullPreviewOpen, setIsFullPreviewOpen] = useState(false);

  // Check if the preview URL is present and not failed
  const isBlobActive = Boolean(
    attachment.localPreviewUrl &&
    (!activeBlobUrls || activeBlobUrls.has(attachment.localPreviewUrl))
  );

  const canShowPreview = Boolean(attachment.localPreviewUrl && !hasLoadError && isBlobActive);
  const sizeFormatted = formatBytes(attachment.sizeBytes);
  const dimensionInfo =
    attachment.width && attachment.height ? `${attachment.width}×${attachment.height} px` : null;

  // Handle ESC key to close full preview modal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsFullPreviewOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isFullPreviewOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isFullPreviewOpen, handleKeyDown]);

  return (
    <div className="mb-2.5 max-w-[280px] sm:max-w-[320px]">
      {canShowPreview ? (
        <>
          <div
            className="group relative rounded-xl overflow-hidden border border-white/25 bg-black/25 shadow-inner cursor-pointer"
            onClick={() => setIsFullPreviewOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsFullPreviewOpen(true);
              }
            }}
            aria-label={`Bofya ili kutazama ${attachment.fileName || 'picha'} kwa ukubwa kamili`}
            title="Bofya kutazama picha kamili"
          >
            <div className="relative">
              <img
                src={attachment.localPreviewUrl}
                alt={attachment.fileName || 'Picha iliyoambatishwa'}
                className="w-full max-h-64 object-contain bg-black/35 group-hover:opacity-95 transition-opacity"
                loading="lazy"
                onError={() => setHasLoadError(true)}
              />
              {/* Zoom overlay badge on hover/focus */}
              <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white/90 backdrop-blur-xs opacity-80 group-hover:opacity-100 transition-opacity">
                <ZoomIn className="w-4 h-4" />
              </div>
            </div>

            <div className="flex flex-col gap-0.5 px-2.5 py-1.5 text-[11px] bg-black/60 text-white/90 backdrop-blur-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {attachment.fileName || 'Picha'}
                </span>
                {sizeFormatted && (
                  <span className="text-[10px] text-white/70 shrink-0">
                    {sizeFormatted}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-[9px] text-emerald-300/90 pt-0.5 border-t border-white/10">
                <span>{dimensionInfo || 'Picha ya mtumiaji'}</span>
                <span className="bg-emerald-950/60 text-emerald-200 px-1 py-0.2 rounded text-[9px]">
                  Kipindi cha sasa
                </span>
              </div>
            </div>
          </div>

          {/* Accessible Lightbox Full Preview Modal */}
          {isFullPreviewOpen && attachment.localPreviewUrl && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
              onClick={() => setIsFullPreviewOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Ukaguzi wa picha kamili"
            >
              <div
                className="relative max-w-4xl max-h-[90vh] flex flex-col bg-stone-950 rounded-2xl overflow-hidden border border-stone-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-stone-900 border-b border-stone-800 text-stone-200 text-xs">
                  <div className="flex items-center space-x-2 min-w-0">
                    <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold truncate max-w-[200px] sm:max-w-md">
                      {attachment.fileName || 'Picha ya Ufugaji'}
                    </span>
                    {sizeFormatted && (
                      <span className="text-stone-400 text-[11px]">({sizeFormatted})</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFullPreviewOpen(false)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
                    aria-label="Funga ukaguzi wa picha kamili"
                    title="Funga (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Image Display */}
                <div className="p-2 sm:p-4 flex items-center justify-center overflow-auto max-h-[75vh]">
                  <img
                    src={attachment.localPreviewUrl}
                    alt={attachment.fileName || 'Picha kamili'}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg"
                  />
                </div>

                {/* Modal Footer Note */}
                <div className="px-4 py-2 bg-stone-900/90 border-t border-stone-800 flex items-center justify-between text-[11px] text-stone-400">
                  <span>{dimensionInfo || 'Kipimo hakijabainishwa'}</span>
                  <span className="text-[10px] text-emerald-400">
                    Inapatikana kwenye kipindi hiki cha kivinjari tu
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Honest historical image metadata card (when image is no longer available or after refresh) */
        <div
          className={`rounded-xl p-2.5 text-xs transition-all ${
            isUser
              ? 'border border-emerald-500/40 bg-emerald-800/80 text-white'
              : 'border border-stone-200 bg-stone-50 text-stone-800'
          }`}
          role="region"
          aria-label="Taarifa za picha ya awali"
        >
          <div className="flex items-start space-x-2">
            <div
              className={`p-1.5 rounded-lg shrink-0 ${
                isUser ? 'bg-emerald-900/60 text-emerald-200' : 'bg-stone-200/80 text-stone-600'
              }`}
            >
              {hasLoadError ? (
                <ImageOff className="w-4 h-4" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate text-[12px]">
                {attachment.fileName || 'Picha ya Awali'}
              </div>
              <div
                className={`text-[10px] mt-0.5 ${
                  isUser ? 'text-emerald-200/80' : 'text-stone-500'
                }`}
              >
                {sizeFormatted && <span>{sizeFormatted}</span>}
                {sizeFormatted && dimensionInfo && <span> • </span>}
                {dimensionInfo && <span>{dimensionInfo}</span>}
              </div>
            </div>
          </div>

          {/* Honest privacy & availability notice */}
          <div
            className={`mt-2 pt-1.5 border-t flex items-start space-x-1.5 text-[10px] leading-tight ${
              isUser
                ? 'border-emerald-600/40 text-emerald-100/90'
                : 'border-stone-200 text-stone-600'
            }`}
          >
            <Shield className="w-3 h-3 shrink-0 mt-0.5 text-emerald-300" />
            <span>
              Picha ya ujumbe huu haijahifadhiwa kwa faragha (Haipatikani tena kwa ukaguzi wa macho wa AI).
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
