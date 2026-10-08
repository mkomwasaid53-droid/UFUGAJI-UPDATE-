import React, { useState } from 'react';
import {
  X,
  Send,
  Loader2,
  Image,
  AlertCircle,
  Shield,
  FileText,
  Sparkles,
  Info
} from 'lucide-react';
import { GumzoGroup, GumzoMediaItem } from '../../types/gumzo';
import { gumzoPostService } from '../../services/gumzoPostService';

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
  const [imageUrl, setImageUrl] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const [status, setStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !imageUrl.trim()) {
      setErrorMessage('Tafadhali andika maudhui au weka picha kwa chapisho hili.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const mediaItems: GumzoMediaItem[] = [];
      if (imageUrl.trim()) {
        mediaItems.push({
          id: `med_${Date.now()}`,
          type: 'image',
          url: imageUrl.trim(),
          caption: imageCaption.trim() || undefined,
        });
      }

      await gumzoPostService.postBrowserCreatePost({
        input: {
          groupId: group.groupId,
          content: content.trim(),
          media: mediaItems,
          status,
          visibility: 'VISIBLE',
        },
        callerUserId: currentUserId,
      });

      setContent('');
      setImageUrl('');
      setImageCaption('');
      setShowImageInput(false);
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
              rows={5}
              maxLength={5000}
              className="w-full text-sm border border-stone-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 rounded-2xl p-3.5 outline-hidden transition-all placeholder:text-stone-400 resize-y"
            />
            <div className="flex justify-between items-center text-[11px] text-stone-400 px-1">
              <span>Andika kwa ufasaha na heshima.</span>
              <span>{content.length} / 5,000</span>
            </div>
          </div>

          {/* Optional Image Attachment */}
          <div className="space-y-2 pt-1 border-t border-stone-100">
            {!showImageInput ? (
              <button
                type="button"
                onClick={() => setShowImageInput(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-emerald-700 bg-stone-100 hover:bg-emerald-50 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                <Image className="w-3.5 h-3.5" />
                <span>+ Ongeza Kiambatisho cha Picha (Image URL)</span>
              </button>
            ) : (
              <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                    <Image className="w-3.5 h-3.5 text-emerald-700" />
                    Kiambatisho cha Picha
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowImageInput(false);
                      setImageUrl('');
                      setImageCaption('');
                    }}
                    className="text-[11px] text-stone-400 hover:text-rose-600"
                  >
                    Ondoa
                  </button>
                </div>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://mfano.com/picha-ya-mifugo.jpg"
                  className="w-full text-xs border border-stone-300 rounded-xl p-2.5 focus:border-emerald-600 outline-hidden bg-white"
                />
                <input
                  type="text"
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                  placeholder="Maelezo mafupi ya picha (Caption - hiari)"
                  maxLength={150}
                  className="w-full text-xs border border-stone-300 rounded-xl p-2 focus:border-emerald-600 outline-hidden bg-white"
                />
              </div>
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
