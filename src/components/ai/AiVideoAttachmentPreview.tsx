/**
 * ============================================================================
 * V1.2A VIDEO INPUT FOUNDATION
 * PROJECT: UFUGAJI UPDATE
 * STAGE: VIDEO_PREVIEW (Composer Attachment Preview)
 * ============================================================================
 */

import React from 'react';
import { X, RefreshCw, Film } from 'lucide-react';
import { AiVideoAttachment } from '../../types/videoPipeline';
import { formatBytes, formatVideoDuration } from '../../utils/videoValidation';

interface AiVideoAttachmentPreviewProps {
  video: AiVideoAttachment;
  onRemove: () => void;
  onReplace?: () => void;
  disabled?: boolean;
}

export const AiVideoAttachmentPreview: React.FC<AiVideoAttachmentPreviewProps> = ({
  video,
  onRemove,
  onReplace,
  disabled = false,
}) => {
  const sizeFormatted = formatBytes(video.fileSize);
  const durationFormatted = video.duration ? formatVideoDuration(video.duration) : null;
  const dimensionInfo =
    video.width && video.height ? `${video.width}×${video.height}` : null;

  return (
    <div
      id="ai-video-attachment-preview"
      className="mb-2.5 p-2 sm:p-2.5 bg-emerald-50/95 border border-emerald-300 rounded-xl transition-all shadow-2xs text-stone-900 animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-full overflow-hidden"
      role="region"
      aria-label="Video iliyoambatishwa kwa ajili ya kutumwa kwa Msaidizi"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        {/* Video Player / Preview */}
        <div className="relative w-full sm:w-44 max-h-40 rounded-lg overflow-hidden bg-black/80 border border-emerald-300 shrink-0 flex items-center justify-center">
          {video.localPreviewUrl ? (
            <video
              src={video.localPreviewUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-36 object-contain"
              aria-label={`Hakiki video: ${video.fileName || 'Video ya mfugaji'}`}
            >
              Kivinjari chako hakiwezi kucheza video hii moja kwa moja.
            </video>
          ) : (
            <div className="p-4 flex flex-col items-center justify-center text-emerald-100">
              <Film className="w-8 h-8 text-emerald-300 mb-1" />
              <span className="text-[11px]">{video.fileName}</span>
            </div>
          )}
        </div>

        {/* Video Metadata & Description */}
        <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
          <div>
            <div className="flex items-center space-x-1.5">
              <Film className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="text-xs font-bold text-emerald-950 truncate max-w-[200px] xs:max-w-[260px] sm:max-w-[320px]">
                {video.fileName || 'Video ya Mfugaji'}
              </span>
            </div>

            <div className="text-[11px] text-emerald-800/90 flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-1">
              {sizeFormatted && <span className="font-medium">{sizeFormatted}</span>}
              {durationFormatted && (
                <>
                  <span className="text-emerald-500">•</span>
                  <span className="font-medium">Muda: {durationFormatted}</span>
                </>
              )}
              {dimensionInfo && (
                <>
                  <span className="text-emerald-500">•</span>
                  <span>{dimensionInfo} px</span>
                </>
              )}
            </div>

            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center text-[10px] bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                Tayari kutumwa (Msingi wa Video V1.2A)
              </span>
              <span className="text-[10px] text-emerald-700 font-medium">
                Video itatumwa kwenye ujumbe huu
              </span>
            </div>
          </div>

          {/* Action Buttons: Replace & Remove */}
          <div className="flex items-center space-x-1.5 mt-2.5 sm:mt-2 self-end sm:self-start">
            {onReplace && (
              <button
                type="button"
                id="ai-replace-video-btn"
                onClick={onReplace}
                disabled={disabled}
                className="flex items-center justify-center space-x-1 text-xs min-h-[38px] px-3 py-1.5 rounded-lg text-emerald-900 hover:text-emerald-950 bg-emerald-100/90 hover:bg-emerald-200/90 transition-colors cursor-pointer border border-emerald-300 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                title="Badili video hii na nyingine kutoka kwenye simu yako"
                aria-label="Badili video iliyoambatishwa na video nyingine"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-semibold">Badili Video</span>
              </button>
            )}

            <button
              type="button"
              id="ai-remove-video-btn"
              onClick={onRemove}
              disabled={disabled}
              className="flex items-center justify-center space-x-1 text-xs min-h-[38px] px-3 py-1.5 rounded-lg text-stone-700 hover:text-red-700 hover:bg-red-50 border border-stone-200 hover:border-red-200 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-600"
              title="Ondoa video hii"
              aria-label="Ondoa video iliyoambatishwa"
            >
              <X className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold">Ondoa</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
