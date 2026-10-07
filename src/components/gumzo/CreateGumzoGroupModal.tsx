import React, { useState } from 'react';
import { X, Users, Globe, Lock, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { CreateGumzoGroupInput, GumzoGroup, GUMZO_CATEGORIES, GumzoGroupVisibility } from '../../types/gumzo';
import { gumzoGroupService } from '../../services/gumzoGroupService';

interface CreateGumzoGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  onSuccess: (group: GumzoGroup) => void;
}

export const CreateGumzoGroupModal: React.FC<CreateGumzoGroupModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('ngombe');
  const [visibility, setVisibility] = useState<GumzoGroupVisibility>('PUBLIC');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 3) {
      setErrorMessage('Tafadhali ingiza jina la kikundi lenye angalau herufi 3.');
      return;
    }
    if (trimmedName.length > 100) {
      setErrorMessage('Jina la kikundi lisizidi herufi 100.');
      return;
    }

    const trimmedDesc = description.trim();
    if (!trimmedDesc || trimmedDesc.length < 10) {
      setErrorMessage('Tafadhali andika maelezo ya kikundi yenye angalau herufi 10.');
      return;
    }
    if (trimmedDesc.length > 1500) {
      setErrorMessage('Maelezo ya kikundi yasizidi herufi 1,500.');
      return;
    }

    try {
      setIsSubmitting(true);
      const input: CreateGumzoGroupInput = {
        name: trimmedName,
        description: trimmedDesc,
        categoryId,
        visibility,
      };

      const result = await gumzoGroupService.postBrowserCreateGroup(input, currentUserId);
      onSuccess(result.group);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Hitilafu imetokea wakati wa kuunda kikundi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-stone-900 to-emerald-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Anzisha Kikundi Kipya</h2>
              <p className="text-xs text-stone-300">Jamii ya Wafugaji — Gumzo (V9.1)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-stone-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Group Name */}
          <div className="space-y-1.5">
            <label className="font-bold text-stone-800">Jina la Kikundi *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mfano: Wafugaji wa Ng'ombe wa Maziwa Arusha"
              maxLength={100}
              required
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
            <p className="text-[10px] text-stone-400">Herufi 3 hadi 100.</p>
          </div>

          {/* Category Select */}
          <div className="space-y-1.5">
            <label className="font-bold text-stone-800">Kategoria ya Ufugaji *</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              {GUMZO_CATEGORIES.map((cat) => (
                <option key={cat.categoryId} value={cat.categoryId}>
                  {cat.nameSwahili}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="font-bold text-stone-800">Maelezo na Lengo la Kikundi *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Eleza nani anafaa kujiunga, malengo makuu, mada zitakazojadiliwa, na maelekezo ya msingi..."
              maxLength={1500}
              required
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
            <p className="text-[10px] text-stone-400">{description.length}/1,500 herufi (Angalau 10).</p>
          </div>

          {/* Visibility Options */}
          <div className="space-y-2">
            <label className="font-bold text-stone-800">Uonekano wa Kikundi (Visibility) *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label
                onClick={() => setVisibility('PUBLIC')}
                className={`p-3 rounded-2xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                  visibility === 'PUBLIC'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-semibold'
                    : 'border-stone-200 bg-white hover:bg-stone-50 text-stone-600'
                }`}
              >
                <Globe className={`w-4 h-4 mt-0.5 shrink-0 ${visibility === 'PUBLIC' ? 'text-emerald-700' : 'text-stone-400'}`} />
                <div>
                  <div className="text-xs font-bold">Umma (Public)</div>
                  <div className="text-[10px] text-stone-500 font-normal leading-tight">
                    Mtu yeyote anaweza kukiona na kujiunga.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setVisibility('PRIVATE')}
                className={`p-3 rounded-2xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                  visibility === 'PRIVATE'
                    ? 'border-amber-600 bg-amber-50/70 text-amber-950 font-semibold'
                    : 'border-stone-200 bg-white hover:bg-stone-50 text-stone-600'
                }`}
              >
                <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${visibility === 'PRIVATE' ? 'text-amber-700' : 'text-stone-400'}`} />
                <div>
                  <div className="text-xs font-bold">Faragha (Private)</div>
                  <div className="text-[10px] text-stone-500 font-normal leading-tight">
                    Maudhui ni kwa wanachama waliothibitishwa pekee.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Leadership Approval Notice (Principle & Requirement 11) */}
          <div className="p-3 bg-stone-100 rounded-xl border border-stone-200 text-stone-600 text-[11px] flex items-start gap-2 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>
              <strong>Uongozi wa Jamii:</strong> Wewe utakuwa Mwanzilishi (Founder Admin). Maombi yako yataingia kwenye ukaguzi wa uongozi wa jukwaa (PENDING_APPROVAL) ili kudumisha ubora na viwango vya wafugaji.
            </span>
          </div>

          {/* Submit buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 font-semibold cursor-pointer min-h-[44px]"
            >
              Ghairi
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer min-h-[44px]"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Wasilisha Maombi ya Kikundi</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
