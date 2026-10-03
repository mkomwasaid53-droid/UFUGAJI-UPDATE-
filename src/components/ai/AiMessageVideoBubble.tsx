/**
 * ============================================================================
 * V1.2D VIDEO ↔ CONVERSATION INTEGRATION
 * PROJECT: UFUGAJI UPDATE
 * STAGES: VIDEO_RENDERING (Chat Bubble) & VIDEO_PERSISTENCE_METADATA
 * 
 * INVARIANTS:
 * - Displays local blob video preview only while active in memory during the current session.
 * - For historical sessions / reloaded messages, safely and honestly falls back
 *   to a safe metadata-only card with explicit privacy and non-availability disclosures.
 * - No raw bytes, base64 data, or permanent blob URLs are stored or expected.
 * ============================================================================
 */

import React, { useState } from 'react';
import { Film, VideoOff, Shield } from 'lucide-react';
import { AiVideoAttachment } from '../../types/videoPipeline';
import { formatBytes, formatVideoDuration } from '../../utils/videoValidation';

interface AiMessageVideoBubbleProps {
  attachment: AiVideoAttachment;
  isUser: boolean;
  activeBlobUrls?: Set<string>;
}

export const AiMessageVideoBubble: React.FC<AiMessageVideoBubbleProps> = ({
  attachment,
  isUser,
  activeBlobUrls,
}) => {
  const [hasPlaybackError, setHasPlaybackError] = useState(false);

  // Check if the preview URL is present and not expired/revoked
  const isBlobActive = Boolean(
    attachment.localPreviewUrl &&
    (!activeBlobUrls || activeBlobUrls.has(attachment.localPreviewUrl))
  );

  const canPlayVideo = Boolean(attachment.localPreviewUrl && !hasPlaybackError && isBlobActive);
  const sizeFormatted = formatBytes(attachment.fileSize || attachment.sizeBytes || 0);
  const durationValue = attachment.duration || attachment.durationSeconds;
  const durationFormatted = durationValue ? formatVideoDuration(durationValue) : null;
  const dimensionInfo =
    attachment.width && attachment.height ? `${attachment.width}×${attachment.height} px` : null;

  return (
    <div className="mb-2.5 max-w-[280px] sm:max-w-[340px]">
      {canPlayVideo ? (
        <div className="rounded-xl overflow-hidden border border-white/25 bg-black/40 shadow-inner">
          <div className="relative bg-black/80">
            <video
              src={attachment.localPreviewUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-56 object-contain"
              onError={() => setHasPlaybackError(true)}
              aria-label={`Video ya ujumbe: ${attachment.fileName || 'Video'}`}
            >
              Kivinjari hakiwezi kucheza video hii moja kwa moja.
            </video>
          </div>

          <div className="flex flex-col gap-1 px-2.5 py-1.5 text-[11px] bg-black/60 text-white/90 backdrop-blur-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
                <span className="truncate">{attachment.fileName || 'Video'}</span>
              </span>
              {durationFormatted && (
                <span className="shrink-0 text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">
                  {durationFormatted}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-white/70 pt-0.5 border-t border-white/10">
              <div className="flex items-center gap-1.5">
                {sizeFormatted && <span>{sizeFormatted}</span>}
                {dimensionInfo && (
                  <>
                    <span>•</span>
                    <span>{dimensionInfo}</span>
                  </>
                )}
              </div>
              <span className="bg-emerald-950/70 text-emerald-200 px-1.5 py-0.5 rounded text-[9px] font-medium border border-emerald-500/30">
                Kipindi cha sasa
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Historical Session / Expired Blob Safe Metadata Card (Honest Privacy & Non-Availability) */
        <div
          className={`p-3 rounded-xl border text-xs leading-snug space-y-2.5 transition-all ${
            isUser
              ? 'bg-emerald-800/85 border-emerald-600/60 text-emerald-50'
              : 'bg-stone-50 border-stone-200 text-stone-800'
          }`}
          role="region"
          aria-label="Taarifa za video iliyoambatanishwa hapo awali"
        >
          <div className="flex items-start space-x-2">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                isUser ? 'bg-emerald-700/80 text-emerald-200' : 'bg-stone-200 text-stone-600'
              }`}
            >
              {hasPlaybackError ? (
                <VideoOff className="w-4 h-4" />
              ) : (
                <Film className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate text-[12px]">
                {attachment.fileName || 'Video ya Mfugaji'}
              </div>
              <div
                className={`text-[11px] mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${
                  isUser ? 'text-emerald-200' : 'text-stone-500'
                }`}
              >
                {sizeFormatted && <span>{sizeFormatted}</span>}
                {durationFormatted && (
                  <>
                    <span>•</span>
                    <span>Muda: {durationFormatted}</span>
                  </>
                )}
                {dimensionInfo && (
                  <>
                    <span>•</span>
                    <span>{dimensionInfo}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Honest privacy & availability notice */}
          <div
            className={`pt-2 border-t flex items-start space-x-1.5 text-[10px] leading-tight ${
              isUser
                ? 'border-emerald-600/40 text-emerald-100/90'
                : 'border-stone-200 text-stone-600'
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-300" />
            <div className="space-y-0.5">
              <p className="font-medium">
                Video ya ujumbe huu haijahifadhiwa kwa faragha.
              </p>
              <p className="opacity-90">
                Haipatikani tena kwa ukaguzi wa macho wa AI.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
