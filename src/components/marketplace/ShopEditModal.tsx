import React, { useState, useRef } from 'react';
import { DigitalShop } from '../../types/marketplace';
import { TANZANIA_REGIONS } from '../../data/marketplaceData';
import { compressImage } from '../../services/mediaService';
import {
  X,
  Save,
  Store,
  MapPin,
  Phone,
  MessageCircle,
  AlertCircle,
  Globe,
  Lock,
  Upload,
  Camera,
  Image as ImageIcon,
  Trash2,
  Sparkles
} from 'lucide-react';

interface ShopEditModalProps {
  initialShop: DigitalShop;
  onClose: () => void;
  onSave: (shopData: Partial<DigitalShop>) => Promise<void>;
}

export const ShopEditModal: React.FC<ShopEditModalProps> = ({
  initialShop,
  onClose,
  onSave
}) => {
  const [shopName, setShopName] = useState(initialShop.shopName || '');
  const [description, setDescription] = useState(initialShop.description || '');
  const [location, setLocation] = useState(initialShop.location || 'Dar es Salaam');
  const [district, setDistrict] = useState(initialShop.district || '');
  const [phone, setPhone] = useState(initialShop.phone || '');
  const [whatsapp, setWhatsapp] = useState(initialShop.whatsapp || initialShop.phone || '');
  const [isPublished, setIsPublished] = useState<boolean>(initialShop.isPublished ?? true);
  const [logoImage, setLogoImage] = useState<string | undefined>(initialShop.logoImage);
  const [coverImage, setCoverImage] = useState<string | undefined>(initialShop.coverImage);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Tafadhali chagua faili la picha (JPG, PNG, WebP).');
      return;
    }

    try {
      setIsProcessingMedia(true);
      setErrorMsg(null);
      const compressed = await compressImage(file, 600, 600, 0.85);
      setLogoImage(compressed.dataUrl);
    } catch (err: any) {
      console.error('Hitilafu ya kupakia logo:', err);
      setErrorMsg('Imeshindwa kusindika picha ya logo. Tafadhali jaribu picha nyingine.');
    } finally {
      setIsProcessingMedia(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Tafadhali chagua faili la picha (JPG, PNG, WebP).');
      return;
    }

    try {
      setIsProcessingMedia(true);
      setErrorMsg(null);
      const compressed = await compressImage(file, 1600, 800, 0.82);
      setCoverImage(compressed.dataUrl);
    } catch (err: any) {
      console.error('Hitilafu ya kupakia cover:', err);
      setErrorMsg('Imeshindwa kusindika picha ya bango (cover). Tafadhali jaribu tena.');
    } finally {
      setIsProcessingMedia(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!shopName.trim() || shopName.trim().length < 2) {
      setErrorMsg('Tafadhali weka jina sahihi la Duka (angalau herufi 2).');
      return;
    }
    if (!phone.trim() || phone.trim().length < 9) {
      setErrorMsg('Tafadhali weka namba ya simu inayopatikana.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave({
        shopName: shopName.trim(),
        description: description.trim(),
        location: location.trim(),
        region: location.trim(),
        district: district.trim(),
        phone: phone.trim(),
        whatsapp: whatsapp.trim() || phone.trim(),
        isPublished,
        logoImage: logoImage || '',
        coverImage: coverImage || ''
      });
      onClose();
    } catch (err: any) {
      console.error('Hitilafu ya kuhifadhi duka:', err);
      setErrorMsg(err?.message || 'Hitilafu imetokea wakati wa kuhifadhi taarifa za duka.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-stone-900 to-amber-950 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-800 text-white flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white leading-snug">
                Mipangilio ya Duka Langu
              </h3>
              <p className="text-xs text-amber-200/90 pt-0.5">
                Boresha picha za utambulisho na taarifa za duka lako
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Shop Media Branding: Banner Cover & Logo */}
            <div className="space-y-3 p-4 bg-stone-50 rounded-2xl border border-stone-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-amber-700" />
                  <span>Picha ya Bango (Cover) & Nembo (Logo)</span>
                </label>
                {isProcessingMedia && (
                  <span className="text-[11px] font-semibold text-amber-800 animate-pulse">
                    Inasindika picha...
                  </span>
                )}
              </div>

              {/* Cover Preview & Upload */}
              <div className="relative w-full h-28 sm:h-36 rounded-xl bg-stone-200 overflow-hidden border border-stone-300 flex items-center justify-center group">
                {coverImage ? (
                  <>
                    <img
                      src={coverImage}
                      alt="Bango la Duka"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => coverInputRef.current?.click()}
                        className="px-3 py-1.5 bg-white text-stone-900 font-bold text-xs rounded-lg shadow-md cursor-pointer hover:bg-stone-100"
                      >
                        Badilisha Bango
                      </button>
                      <button
                        type="button"
                        onClick={() => setCoverImage(undefined)}
                        className="p-1.5 bg-rose-600 text-white rounded-lg shadow-md cursor-pointer hover:bg-rose-700"
                        title="Ondoa Bango"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div
                    onClick={() => coverInputRef.current?.click()}
                    className="flex flex-col items-center justify-center text-stone-500 cursor-pointer p-4 text-center hover:text-stone-700"
                  >
                    <Upload className="w-6 h-6 mb-1 text-amber-700" />
                    <span className="text-xs font-bold text-stone-800">Pakia Picha ya Bango la Duka (Cover)</span>
                    <span className="text-[10.5px] text-stone-500">Inapendekezwa picha pana ya shamba au mifugo</span>
                  </div>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  className="hidden"
                />
              </div>

              {/* Logo Preview & Upload */}
              <div className="flex items-center gap-3 pt-1">
                <div className="relative w-16 h-16 rounded-2xl bg-amber-800 text-white font-black text-xl flex items-center justify-center overflow-hidden border-2 border-white shadow-md shrink-0 bg-stone-100">
                  {logoImage ? (
                    <img
                      src={logoImage}
                      alt="Logo"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{shopName ? shopName.charAt(0).toUpperCase() : 'D'}</span>
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="py-1.5 px-3 bg-white hover:bg-stone-100 border border-stone-300 text-stone-800 text-xs font-semibold rounded-xl cursor-pointer shadow-2xs"
                    >
                      {logoImage ? 'Badili Logo' : 'Pakia Logo ya Duka'}
                    </button>
                    {logoImage && (
                      <button
                        type="button"
                        onClick={() => setLogoImage(undefined)}
                        className="py-1.5 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl cursor-pointer"
                      >
                        Ondoa
                      </button>
                    )}
                  </div>
                  <p className="text-[10.5px] text-stone-500">
                    Nembo au picha ya wasifu wa duka (mraba/square inapendekezwa).
                  </p>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            {/* Shop Name */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Jina la Duka la Kidijitali *
              </label>
              <input
                type="text"
                required
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Mfano: Juma Poultry Farm & Hatchery"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Maelezo Kuhusu Duka / Shamba Lako
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Eleza historia ya shamba lako, ubora wa mifugo, uzoefu wako, au huduma unazotoa kwa wafugaji..."
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
              />
            </div>

            {/* Location & District */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Mkoa *
                </label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                >
                  {TANZANIA_REGIONS.map((reg) => (
                    <option key={reg} value={reg}>
                      {reg}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Wilaya / Kata / Mtaa
                </label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Mfano: Kinondoni au Tengeru"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                />
              </div>
            </div>

            {/* Phone & WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Namba ya Simu ya Kupiga *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0712345678"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Namba ya WhatsApp
                </label>
                <div className="relative">
                  <MessageCircle className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="0712345678"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white min-h-[44px]"
                  />
                </div>
              </div>
            </div>

            {/* Shop Visibility Switch */}
            <div className="pt-2 border-t border-stone-100">
              <label className="block text-xs font-semibold text-stone-700 mb-2">
                Hali ya Duka Sokoni (Publish Status)
              </label>
              <div
                onClick={() => setIsPublished(!isPublished)}
                className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                  isPublished
                    ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900'
                    : 'bg-stone-50 border-stone-300 text-stone-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      isPublished ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {isPublished ? <Globe className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold">
                      {isPublished ? 'Duka Liko Hewani (Published)' : 'Duka Limefichwa (Unpublished / Draft)'}
                    </div>
                    <div className="text-[11px] text-stone-500">
                      {isPublished
                        ? 'Wanunuzi wanaweza kuona duka na bidhaa zako zote.'
                        : 'Duka limefichwa kwa wanunuzi, unaweza kuliandaa kabla ya kulifungua.'}
                    </div>
                  </div>
                </div>

                <div
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    isPublished ? 'bg-emerald-600' : 'bg-stone-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      isPublished ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || isProcessingMedia}
              className="py-2.5 px-4 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[44px]"
            >
              Ghairi
            </button>

            <button
              type="submit"
              disabled={isSubmitting || isProcessingMedia}
              className="py-2.5 px-6 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer min-h-[44px]"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Inahifadhi...' : 'Hifadhi Mabadiliko'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

