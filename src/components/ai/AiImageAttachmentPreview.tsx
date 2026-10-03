/**
 * ============================================================================
 * V1.1 IMAGE FOUNDATION — FROZEN AFTER V1.1.7
 * PROJECT: UFUGAJI UPDATE
 * STAGE: IMAGE_RENDERING (Composer Preview) & IMAGE_STATE
 * ============================================================================
 */
import React from 'react';
import { X, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { AiImageAttachment } from '../../types';

interface AiImageAttachmentPreviewProps {
  image: AiImageAttachment;
  onRemove: () => void;
  onReplace?: () => void;
  disabled?: boolean;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AiImageAttachmentPreview: React.FC<AiImageAttachmentPreviewProps> = ({
  image,
  onRemove,
  onReplace,
  disabled = false,
}) => {
  const sizeFormatted = formatBytes(image.sizeBytes);
  const dimensionInfo = image.width && image.height ? `${image.width}×${image.height}` : null;

  return (
    <div
      id="ai-image-attachment-preview"
      className="mb-2.5 p-2 sm:p-2.5 bg-emerald-50/95 border border-emerald-300 rounded-xl flex items-center justify-between gap-2 transition-all shadow-2xs text-stone-900 animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-full overflow-hidden"
      role="region"
      aria-label="Picha iliyoambatishwa kwa ajili ya kutumwa kwa Msaidizi"
    >
      {/* Thumbnail + Details */}
      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
        <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-emerald-950/10 border border-emerald-300 shrink-0 flex items-center justify-center">
          {image.localPreviewUrl ? (
            <img
              src={image.localPreviewUrl}
              alt={image.fileName || 'Picha iliyochaguliwa'}
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="w-5 h-5 text-emerald-700" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-bold text-emerald-950 truncate max-w-[150px] xs:max-w-[200px] sm:max-w-[280px]">
              {image.fileName || 'Picha iliyoambatishwa'}
            </span>
          </div>
          <div className="text-[11px] text-emerald-800/90 flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
            {sizeFormatted && <span className="font-medium">{sizeFormatted}</span>}
            {sizeFormatted && dimensionInfo && <span className="text-emerald-500">•</span>}
            {dimensionInfo && <span>{dimensionInfo} px</span>}
            <span className="inline-flex items-center text-[10px] bg-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
              Tayari kutumwa
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons: Replace & Remove with accessible touch targets */}
      <div className="flex items-center space-x-1 shrink-0">
        {onReplace && (
          <button
            type="button"
            id="ai-replace-image-btn"
            onClick={onReplace}
            disabled={disabled}
            className="flex items-center justify-center space-x-1 text-xs min-h-[40px] px-2.5 py-1.5 rounded-lg text-emerald-900 hover:text-emerald-950 bg-emerald-100/80 hover:bg-emerald-200/80 transition-colors cursor-pointer border border-emerald-300 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            title="Badili picha hii na picha nyingine kutoka kwenye simu yako"
            aria-label="Badili picha iliyoambatishwa na picha nyingine"
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xs:inline text-[11px] font-semibold">Badili</span>
          </button>
        )}

        <button
          type="button"
          id="ai-remove-image-btn"
          onClick={onRemove}
          disabled={disabled}
          className="flex items-center justify-center min-w-[40px] min-h-[40px] p-2 rounded-lg text-stone-600 hover:text-red-700 hover:bg-red-50 border border-stone-200 hover:border-red-200 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-600"
          title="Ondoa picha hii"
          aria-label="Ondoa picha iliyoambatishwa"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
