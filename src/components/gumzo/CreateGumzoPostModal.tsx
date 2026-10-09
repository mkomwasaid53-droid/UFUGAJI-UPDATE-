import React, { useState, useRef } from 'react';
import {
  X,
  Send,
  Loader2,
  Image,
  Video,
  AlertCircle,
  Shield,
  FileText,
  Upload,
  Link as LinkIcon,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { GumzoGroup, GumzoMediaItem } from '../../types/gumzo';
import { gumzoPostService } from '../../services/gumzoPostService';
import { uploadGumzoPostMedia } from '../../services/mediaService';

interface CreateGumzoPostModalProps {
  group: GumzoGroup;
  currentUserId: string;
  userRole?: 'FOUNDER_ADMIN' | 'LEADERSHIP_ADMIN' | 'MEMBER' | null;
  isOpen: boolean;
  onClose: () => void;
  onPostCreated: () => void;
}

export const CreateGumzoPostModal: React.FC<CreateGumzoPostModalProps> = ({
  group,
  currentUserId,
  userRole,
  isOpen,
  onClose,
  onPostCreated,
}) => {
  const [content, setContent] = useState('');
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Media attachment state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'image' | 'video' | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Secondary legacy URL input
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|webm|3gp|m4v)$/i);
    const maxBytes = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
    const maxLabel = isVideo ? '50MB' : '15MB';

    if (file.size > maxBytes) {
      setErrorMessage(`Faili limezidi ukubwa unaoruhusiwa wa ${maxLabel} (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);
    setFileType(isVideo ? 'video' : 'image');

    // Create object URL for local instant preview
    const preview = URL.createObjectURL(file);
    setFilePreviewUrl(preview);
    setShowUrlInput(false);
    setExternalUrl('');
  };

  const handleClearAttachment = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setFileType(null);
    setUploadProgress(null);
    setExternalUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanContent = content.trim();
    const cleanExternalUrl = externalUrl.trim();

    if (!cleanContent && !selectedFile && !cleanExternalUrl) {
      setErrorMessage('Tafadhali andika maudhui au weka picha/video kwa chapisho hili.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const mediaItems: GumzoMediaItem[] = [];

      // If user selected device file, upload to persistent storage
      if (selectedFile) {
        setIsUploadingMedia(true);
        setUploadProgress(10);
        try {
          const uploaded = await uploadGumzoPostMedia({
            groupId: group.groupId,
            file: selectedFile,
            callerUserId: currentUserId,
            caption: caption.trim() || undefined,
            onProgress: (pct) => setUploadProgress(pct),
          });
          mediaItems.push(uploaded);
        } catch (uploadErr: any) {
          setIsUploadingMedia(false);
          setUploadProgress(null);
          setErrorMessage(uploadErr.message || 'Hitilafu wakati wa kupakia faili kwenye kumbukumbu.');
          return;
        } finally {
          setIsUploadingMedia(false);
        }
      } else if (cleanExternalUrl) {
        // Support intentional legacy external URL
        const isVideo = cleanExternalUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i);
        mediaItems.push({
          id: `med_${Date.now()}`,
          type: isVideo ? 'video' : 'image',
          url: cleanExternalUrl,
          caption: caption.trim() || undefined,
        });
      }

      await gumzoPostService.postBrowserCreatePost({
        input: {
          groupId: group.groupId,
          content: cleanContent,
          media: mediaItems,
          status,
          visibility: 'VISIBLE',
        },
        callerUserId: currentUserId,
      });

      handleClearAttachment();
      setContent('');
      setCaption('');
      onPostCreated();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Hitilafu wakati wa kutuma chapisho.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full border border-stone-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 leading-tight">
                Andika Chapisho Jipya la Kikundi
              </h2>
              <p className="text-xs text-stone-500">
                Kikundi: <strong className="text-stone-800">{group.name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-600 rounded-xl hover:bg-stone-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Admin Notice */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-900">
            <Shield className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">Mamlaka ya Uongozi (Admin Post)</span>
              <p className="text-emerald-800/90 leading-relaxed">
                Kama kiongozi wa kikundi, machapisho yako yanatumika kutoa mwongozo, mada kuu, ushauri au taarifa rasmi kwa wanachama.
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Content Area */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700 block">
              Maudhui ya Chapisho / Mada <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Andika mada au maelekezo ya kikundi hapa (k.m. Mbinu bora za ulishaji, ratiba ya chanjo, au mada ya wiki)..."
              rows={4}
              maxLength={5000}
              className="w-full text-sm border border-stone-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 rounded-2xl p-3.5 outline-hidden transition-all placeholder:text-stone-400 resize-y"
            />
            <div className="flex justify-between items-center text-[11px] text-stone-400 px-1">
              <span>Andika kwa ufasaha na heshima.</span>
              <span>{content.length} / 5,000</span>
            </div>
          </div>

          {/* Media Attachment Workflow (Primary: Device Picker; Secondary: URL toggle) */}
          <div className="space-y-2.5 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5 text-emerald-700" />
                <span>Kiambatisho cha Picha / Video (Media)</span>
              </label>

              {!selectedFile && !filePreviewUrl && (
                <button
                  type="button"
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="text-[11px] text-stone-500 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                >
                  <LinkIcon className="w-3 h-3" />
                  <span>{showUrlInput ? 'Chagua faili kutoka kifaa' : 'Au tumia kiungo (URL)'}</span>
                </button>
              )}
            </div>

            {/* Hidden device file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              onChange={handleFileSelected}
              className="hidden"
            />

            {/* Attachment preview / Action state */}
            {selectedFile && filePreviewUrl ? (
              <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold text-stone-800 truncate max-w-[240px]">
                      {selectedFile.name}
                    </span>
                    <span className="text-[10px] text-stone-500 font-medium">
                      ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearAttachment}
                    className="p-1 text-stone-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                    title="Ondoa kiambatisho"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Media Preview */}
                <div className="relative rounded-xl overflow-hidden max-h-48 bg-black flex items-center justify-center">
                  {fileType === 'video' ? (
                    <video
                      src={filePreviewUrl}
                      controls
                      className="max-h-48 w-full object-contain"
                    />
                  ) : (
                    <img
                      src={filePreviewUrl}
                      alt="Hakikisho la picha"
                      className="max-h-48 w-full object-contain"
                    />
                  )}
                </div>

                {/* Upload Progress Bar if active */}
                {isUploadingMedia && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-emerald-800 font-bold">
                      <span>Inapakia faili kwenye kumbukumbu...</span>
                      <span>{uploadProgress || 0}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 transition-all duration-300"
                        style={{ width: `${uploadProgress || 10}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Caption input */}
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Maelezo mafupi ya picha/video (Caption - hiari)"
                  maxLength={150}
                  className="w-full text-xs border border-stone-300 rounded-xl p-2.5 focus:border-emerald-600 outline-hidden bg-white"
                />
              </div>
            ) : showUrlInput ? (
              /* URL fallback */
              <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5">
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://mfano.com/picha-au-video.jpg"
                  className="w-full text-xs border border-stone-300 rounded-xl p-2.5 focus:border-emerald-600 outline-hidden bg-white"
                />
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Maelezo mafupi ya kiungo (Caption - hiari)"
                  maxLength={150}
                  className="w-full text-xs border border-stone-300 rounded-xl p-2 focus:border-emerald-600 outline-hidden bg-white"
                />
              </div>
            ) : (
              /* Device File Picker CTA Button */
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 border-2 border-dashed border-stone-200 hover:border-emerald-500 rounded-2xl flex items-center justify-center gap-2 text-xs font-semibold text-stone-600 hover:text-emerald-700 bg-stone-50/50 hover:bg-emerald-50/30 transition-all cursor-pointer group"
              >
                <Upload className="w-4 h-4 text-stone-400 group-hover:text-emerald-600 transition-colors" />
                <span>Chagua Picha au Video kutoka kwenye kifaa chako (Hadi 50MB)</span>
              </button>
            )}
          </div>

          {/* Status Selection */}
          <div className="flex items-center gap-3 pt-2 text-xs">
            <span className="font-bold text-stone-600">Aina ya Uchapishaji:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="postStatus"
                checked={status === 'PUBLISHED'}
                onChange={() => setStatus('PUBLISHED')}
                className="text-emerald-700 focus:ring-emerald-600"
              />
              <span className="font-semibold text-stone-800">Chapisha Moja kwa Moja (Published)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="postStatus"
                checked={status === 'DRAFT'}
                onChange={() => setStatus('DRAFT')}
                className="text-emerald-700 focus:ring-emerald-600"
              />
              <span className="font-semibold text-stone-600">Hifadhi Rasimu (Draft)</span>
            </label>
          </div>

          {/* Submit Actions */}
          <div className="pt-4 border-t border-stone-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs min-h-[40px]"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{status === 'PUBLISHED' ? 'Tuma Chapisho' : 'Hifadhi Rasimu'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
