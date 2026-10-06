import React from 'react';
import { DigitalShop, VerificationStatus } from '../../types/marketplace';
import { SellerVerification, PublicSellerVerificationBadge } from '../../types/sellerVerification';
import { sellerVerificationService } from '../../services/sellerVerificationService';
import {
  Store,
  MapPin,
  Phone,
  MessageCircle,
  ShieldCheck,
  Clock,
  Shield,
  Edit3,
  Eye,
  Globe,
  Lock,
  UserCheck,
  ShieldAlert,
  AlertTriangle
} from 'lucide-react';

interface ShopHeaderProps {
  shop: DigitalShop;
  verificationStatus?: VerificationStatus;
  authoritativeVerification?: SellerVerification | null;
  publicBadge?: PublicSellerVerificationBadge | null;
  isOwner?: boolean;
  totalProducts?: number;
  totalCatalogues?: number;
  onEditShop?: () => void;
  onPreviewAsBuyer?: () => void;
  onTogglePublish?: () => void;
}

export const ShopHeader: React.FC<ShopHeaderProps> = ({
  shop,
  verificationStatus = 'unverified',
  authoritativeVerification,
  publicBadge,
  isOwner = false,
  totalProducts = 0,
  totalCatalogues = 0,
  onEditShop,
  onPreviewAsBuyer,
  onTogglePublish,
}) => {
  // V1.11C-CORRECTIVE-1: Single authoritative public verification projection
  const publicBadgeSignal = publicBadge || sellerVerificationService.getPublicSellerBadge(shop.sellerId);
  const isAuthoritativeVerified = Boolean(
    (publicBadgeSignal && publicBadgeSignal.isVerified && publicBadgeSignal.badgeStatus === 'ACTIVE') ||
    (authoritativeVerification && authoritativeVerification.status === 'APPROVED' && authoritativeVerification.badgeStatus === 'ACTIVE' && authoritativeVerification.hasActiveBadge)
  );

  const isAuthoritativeSuspended = Boolean(
    (publicBadgeSignal && publicBadgeSignal.badgeStatus === 'SUSPENDED') ||
    (authoritativeVerification && (authoritativeVerification.status === 'SUSPENDED' || authoritativeVerification.badgeStatus === 'SUSPENDED'))
  );

  const isAuthoritativePending = !isAuthoritativeVerified && !isAuthoritativeSuspended && Boolean(
    authoritativeVerification?.status === 'PENDING_VERIFICATION' ||
    authoritativeVerification?.status === 'UNDER_REVIEW' ||
    authoritativeVerification?.status === 'SUBMITTED' ||
    authoritativeVerification?.status === 'PAYMENT_CONFIRMED'
  );

  const sellerOwnerName =
    authoritativeVerification?.displayName ||
    authoritativeVerification?.businessName ||
    'Mfugaji wa Ufugaji Update';

  const cleanPhone = (shop.phone || '').replace(/\D/g, '');
  const cleanWhatsapp = (shop.whatsapp || shop.phone || '').replace(/\D/g, '');

  const handleCall = () => {
    if (shop.phone) {
      window.location.href = `tel:${shop.phone}`;
    }
  };

  const handleWhatsapp = () => {
    if (cleanWhatsapp) {
      const waNumber = cleanWhatsapp.startsWith('0')
        ? `255${cleanWhatsapp.substring(1)}`
        : cleanWhatsapp;
      const text = encodeURIComponent(
        `Habari! Nimeona duka lako la "${shop.shopName}" kwenye Ufugaji Update Marketplace. Nahitaji taarifa zaidi kuhusu bidhaa zako.`
      );
      window.open(`https://wa.me/${waNumber}?text=${text}`, '_blank');
    }
  };

  return (
    <div
      id={`shop-header-${shop.shopId || shop.sellerId}`}
      className="bg-white rounded-3xl border border-stone-200/90 shadow-xs overflow-hidden mb-6"
    >
      {/* Top Banner Background */}
      <div className="h-32 sm:h-44 bg-gradient-to-r from-stone-900 via-amber-950 to-stone-900 relative p-4 sm:p-6 flex items-start justify-between text-white overflow-hidden">
        {shop.coverImage ? (
          <img
            src={shop.coverImage}
            alt={`${shop.shopName} cover`}
            className="absolute inset-0 w-full h-full object-cover opacity-60"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <div className="relative z-10 flex items-center gap-2">
          <span className="px-3 py-1 bg-black/50 backdrop-blur-xs border border-white/15 rounded-full text-xs font-semibold text-amber-200 flex items-center gap-1.5 shadow-xs">
            <Store className="w-3.5 h-3.5 text-amber-400" />
            <span>Duka la Kidijitali</span>
          </span>

          {shop.isPublished ? (
            <span className="px-3 py-1 bg-emerald-950/80 border border-emerald-500/40 rounded-full text-xs font-bold text-emerald-300 flex items-center gap-1.5 backdrop-blur-xs shadow-xs">
              <Globe className="w-3.5 h-3.5" />
              <span>Linapatikana Sokoni</span>
            </span>
          ) : (
            <span className="px-3 py-1 bg-rose-950/80 border border-rose-500/40 rounded-full text-xs font-bold text-rose-300 flex items-center gap-1.5 backdrop-blur-xs shadow-xs">
              <Lock className="w-3.5 h-3.5" />
              <span>Limefichwa / Rasimu</span>
            </span>
          )}
        </div>

        {isOwner && onEditShop && (
          <button
            type="button"
            onClick={onEditShop}
            className="relative z-10 px-3.5 py-1.5 bg-black/50 hover:bg-black/70 text-white border border-white/20 rounded-xl text-xs font-semibold flex items-center gap-1.5 backdrop-blur-xs transition-colors cursor-pointer min-h-[38px] shadow-xs"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Hariri Duka & Picha</span>
          </button>
        )}
      </div>

      {/* Main Info Box */}
      <div className="p-4 sm:p-6 -mt-10 relative space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          {/* Shop Avatar & Details */}
          <div className="flex items-start sm:items-end gap-3.5">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-amber-800 text-white font-extrabold text-2xl sm:text-3xl flex items-center justify-center shadow-lg border-4 border-white shrink-0 overflow-hidden bg-stone-100">
              {shop.logoImage ? (
                <img
                  src={shop.logoImage}
                  alt={shop.shopName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-amber-700 to-amber-950 flex items-center justify-center text-white font-black text-2xl sm:text-3xl">
                  {shop.shopName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-2 sm:pt-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
                  {shop.shopName}
                </h1>

                {/* Authoritative Verification Badge */}
                {isAuthoritativeVerified ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-300 shadow-2xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Muuzaji Aliyethibitishwa</span>
                  </span>
                ) : isAuthoritativePending ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300 shadow-2xs">
                    <Clock className="w-3.5 h-3.5 text-amber-700" />
                    <span>Uhakiki Unasubiriwa</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[11px] font-medium border border-stone-200">
                    <Shield className="w-3 h-3 text-stone-400" />
                    <span>Haijahakikiwa</span>
                  </span>
                )}
              </div>

              {/* Verified Owner & Location */}
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-stone-600">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-stone-50 border border-stone-200 text-stone-700 font-medium text-xs">
                  <UserCheck className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                  <span>
                    Mmiliki: <strong className="text-stone-900 font-bold">{sellerOwnerName}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-1 text-stone-600 text-xs">
                  <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span>{shop.location || shop.region || 'Tanzania'}</span>
                  {shop.district && <span>• {shop.district}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Action Contact / Owner Buttons */}
          <div className="flex items-center gap-2 flex-wrap pt-2 sm:pt-0">
            {shop.phone && (
              <button
                type="button"
                onClick={handleCall}
                className="py-2.5 px-4 bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 text-xs sm:text-sm font-bold rounded-xl flex items-center gap-2 shadow-2xs transition-colors cursor-pointer min-h-[42px]"
              >
                <Phone className="w-4 h-4 text-emerald-700" />
                <span>Piga Simu ({shop.phone})</span>
              </button>
            )}

            {(shop.whatsapp || shop.phone) && (
              <button
                type="button"
                onClick={handleWhatsapp}
                className="py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center gap-2 shadow-2xs transition-colors cursor-pointer min-h-[42px]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
            )}

            {isOwner && onPreviewAsBuyer && (
              <button
                type="button"
                onClick={onPreviewAsBuyer}
                className="py-2.5 px-3.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer min-h-[42px]"
              >
                <Eye className="w-3.5 h-3.5 text-amber-700" />
                <span>Tazama kama Mnunuzi</span>
              </button>
            )}
          </div>
        </div>

        {/* Shop Description */}
        {shop.description && (
          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed pt-2 border-t border-stone-100">
            {shop.description}
          </p>
        )}

        {/* Quick Stats Bar */}
        <div className="pt-2 flex items-center gap-4 text-xs font-semibold text-stone-500 border-t border-stone-100">
          <div>
            Catalogues: <strong className="text-stone-900">{totalCatalogues}</strong>
          </div>
          <div>•</div>
          <div>
            Bidhaa Sokoni: <strong className="text-stone-900">{totalProducts}</strong>
          </div>
          <div className="hidden sm:inline">•</div>
          <div className="hidden sm:inline text-stone-400 text-[11px]">
            Hali ya duka (kuchapishwa) ni tofauti na uhakiki rasmi wa muuzaji
          </div>
        </div>
      </div>
    </div>
  );
};
