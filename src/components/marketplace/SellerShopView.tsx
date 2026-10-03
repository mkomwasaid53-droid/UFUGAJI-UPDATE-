import React, { useState, useEffect } from 'react';
import {
  DigitalShop,
  ShopCatalogue,
  MarketplaceProduct,
  VerificationStatus
} from '../../types/marketplace';
import { SellerVerification } from '../../types/sellerVerification';
import { ShopHeader } from './ShopHeader';
import { CatalogueManager } from './CatalogueManager';
import { ProductCard } from './ProductCard';
import { SellerVerificationStatusCard } from './SellerVerificationStatusCard';
import { SellerMonetizationCard } from './SellerMonetizationCard';
import { SellerGovernanceBanner } from './SellerGovernanceBanner';
import { checkSellerRestriction } from '../../services/sellerGovernanceService';
import { canSellerSellOnMarketplace } from '../../services/marketplaceGovernanceEnforcement';
import {
  sellerMonetizationService,
  subscribeToSellerMonetization
} from '../../services/sellerMonetizationService';
import { useSellerMonetization } from '../../hooks/useSellerMonetization';
import { SellerMonetizationRecord } from '../../types/sellerMonetization';
import { FreeTrialActivationModal } from './FreeTrialActivationModal';
import { PaymentRequiredModal } from './PaymentRequiredModal';
import {
  Store,
  Layers,
  Package,
  Plus,
  Edit3,
  Eye,
  SlidersHorizontal,
  FolderInput,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Lock,
  Globe
} from 'lucide-react';

interface SellerShopViewProps {
  shop: DigitalShop;
  catalogues: ShopCatalogue[];
  products: MarketplaceProduct[];
  verificationStatus?: VerificationStatus;
  sellerVerification?: SellerVerification | null;
  onApplyVerification?: () => void;
  isLoadingVerification?: boolean;
  onEditShop: () => void;
  onCreateCatalogue: () => void;
  onEditCatalogue: (catalogue: ShopCatalogue) => void;
  onDeleteCatalogue: (catalogueId: string) => Promise<void>;
  onReorderCatalogues: (orderedIds: string[]) => Promise<void>;
  onToggleCatalogueActive: (catalogue: ShopCatalogue) => Promise<void>;
  onCreateProduct: () => void;
  onViewProductDetails: (product: MarketplaceProduct) => void;
  onEditProduct: (product: MarketplaceProduct) => void;
  onDeleteProduct: (product: MarketplaceProduct) => void;
  onToggleProductStatus: (product: MarketplaceProduct) => void;
  onPreviewAsBuyer: () => void;
  onTogglePublishShop: () => Promise<void>;
  onMoveProductCatalogue: (productId: string, targetCatalogueId: string | null) => Promise<void>;
}

export const SellerShopView: React.FC<SellerShopViewProps> = ({
  shop,
  catalogues,
  products,
  verificationStatus = 'unverified',
  sellerVerification,
  onApplyVerification,
  isLoadingVerification,
  onEditShop,
  onCreateCatalogue,
  onEditCatalogue,
  onDeleteCatalogue,
  onReorderCatalogues,
  onToggleCatalogueActive,
  onCreateProduct,
  onViewProductDetails,
  onEditProduct,
  onDeleteProduct,
  onToggleProductStatus,
  onPreviewAsBuyer,
  onTogglePublishShop,
  onMoveProductCatalogue,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'products' | 'catalogues'>('products');
  const [selectedFilterCatalogue, setSelectedFilterCatalogue] = useState<string>('all');
  const [movingProductId, setMovingProductId] = useState<string | null>(null);

  // Filter products by seller's own products and selected catalogue filter
  const myProducts = products.filter((p) => p.sellerId === shop.sellerId);
  const displayedProducts = myProducts.filter((p) => {
    if (selectedFilterCatalogue === 'all') return true;
    if (selectedFilterCatalogue === 'uncategorized') return !p.catalogueId;
    return p.catalogueId === selectedFilterCatalogue;
  });

  const uncategorizedCount = myProducts.filter((p) => !p.catalogueId).length;
  // V1.10A-CORRECTIVE-7: Single Shared Authoritative Monetization State
  const {
    record: monetizationRecord,
    status: currentStatus,
    isLocked,
    revalidate: revalidateMonetization,
    setAuthoritativeRecord
  } = useSellerMonetization(shop?.sellerId, shop?.shopId);

  const creationRestriction = checkSellerRestriction(shop.sellerId, 'LISTING_CREATION');

  // V1.10A-CORRECTIVE-5: Unified Free Trial & Payment Modal States
  const [isFreeTrialModalOpen, setIsFreeTrialModalOpen] = useState<boolean>(false);
  const [trialOriginAction, setTrialOriginAction] = useState<'CREATE_LISTING' | 'DIRECT_CTA' | 'CATALOGUES' | 'PUBLISH_SHOP'>('DIRECT_CTA');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);

  const handleLockedControlClick = (origin: 'CREATE_LISTING' | 'DIRECT_CTA' | 'CATALOGUES' | 'PUBLISH_SHOP') => {
    if (currentStatus === 'NOT_ACTIVATED') {
      setTrialOriginAction(origin);
      setIsFreeTrialModalOpen(true);
    } else {
      setIsPaymentModalOpen(true);
    }
  };

  const handleTrialSuccess = (updatedRecord: SellerMonetizationRecord, origin?: string) => {
    setAuthoritativeRecord(updatedRecord);
    setIsFreeTrialModalOpen(false);

    // Revalidate authoritative state from server in background
    revalidateMonetization().catch(() => {});

    // Requirement 4 & 13: If initiated from Weka Tangazo, automatically continue to listing creation!
    if (origin === 'CREATE_LISTING') {
      if (!creationRestriction.isRestricted) {
        onCreateProduct();
      }
    } else if (origin === 'CATALOGUES') {
      setActiveSubTab('catalogues');
    } else if (origin === 'PUBLISH_SHOP') {
      onTogglePublishShop();
    }
    // Requirement 14: If initiated from DIRECT_CTA, do NOT open product creation; stay on shop page.
  };

  const handleTogglePublish = async () => {
    if (isLocked) {
      handleLockedControlClick('PUBLISH_SHOP');
      return;
    }
    await onTogglePublishShop();
  };

  const handleCreateProductClick = () => {
    if (isLocked) {
      handleLockedControlClick('CREATE_LISTING');
      return;
    }
    if (creationRestriction.isRestricted) {
      alert(creationRestriction.message || 'Uwezo wa kuweka bidhaa mpya umesitishwa kwa sasa na usimamizi wa soko.');
      return;
    }
    onCreateProduct();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* V1.7E Seller Warnings & Restrictions Governance Banner */}
      <SellerGovernanceBanner sellerId={shop.sellerId} />

      {/* Header Banner */}
      <ShopHeader
        shop={shop}
        verificationStatus={verificationStatus}
        authoritativeVerification={sellerVerification}
        isOwner={true}
        totalProducts={myProducts.length}
        totalCatalogues={catalogues.length}
        onEditShop={onEditShop}
        onPreviewAsBuyer={onPreviewAsBuyer}
        onTogglePublish={handleTogglePublish}
      />

      {/* V1.10A Seller Monetization Card (Commercial Subscription & Free Trial) */}
      <SellerMonetizationCard
        sellerUserId={shop.sellerId}
        sellerProfileId={shop.shopId}
        record={monetizationRecord}
        onStatusChange={setAuthoritativeRecord}
        onRequestActivateTrial={() => handleLockedControlClick('DIRECT_CTA')}
      />

      {/* Seller Verification Status & Application Flow (V1.6A Marketplace Trust) */}
      {onApplyVerification && (
        <SellerVerificationStatusCard
          verification={sellerVerification || null}
          onApply={onApplyVerification}
          isLoading={isLoadingVerification}
        />
      )}

      {/* Primary Action & Status Control Bar */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-stone-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Publish Switch */}
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              !isLocked && shop.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'
            }`}
          >
            {!isLocked && shop.isPublished ? <Globe className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-stone-900">
                {isLocked
                  ? '🔒 Duka Limefichwa (Uuzaji Umezuiwa)'
                  : shop.isPublished
                  ? '✓ Duka Linapatikana Hewani (Published)'
                  : 'Duka Limefichwa (Draft)'}
              </span>
              <button
                type="button"
                onClick={handleTogglePublish}
                className="text-[11px] font-bold text-amber-800 hover:text-amber-900 underline cursor-pointer"
              >
                {isLocked
                  ? (currentStatus === 'NOT_ACTIVATED' ? 'Washa Free Trial Kuweka Hewani' : 'Lipa TSh 1,000 Kuweka Hewani')
                  : shop.isPublished
                  ? 'Zima / Ficha Duka'
                  : 'Washa / Chapisha Sasa'}
              </button>
            </div>
            <p className="text-xs text-stone-500">
              {isLocked
                ? 'Washa Free Trial au lipia usajili wa muuzaji ili duka na bidhaa zako zionekane hadharani sokoni.'
                : shop.isPublished
                ? 'Wanunuzi wote wanaweza kufungua duka lako na kuona catalogues zako.'
                : 'Wateja hawawezi kuona duka hili hadi utakapoliweka hewani.'}
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {isLocked ? (
            <button
              type="button"
              onClick={() => handleLockedControlClick('CATALOGUES')}
              className="py-2.5 px-3.5 bg-stone-50 hover:bg-amber-50 text-stone-600 hover:text-amber-900 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer min-h-[42px] border border-stone-200"
              title={currentStatus === 'NOT_ACTIVATED' ? 'Washa Free Trial ili kutumia Catalogues' : 'Lipa TSh 1,000 ili kutumia Catalogues'}
            >
              <Lock className="w-3.5 h-3.5 text-amber-700" />
              <span>🔒 Catalogues</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onCreateCatalogue}
              className="py-2.5 px-3.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer min-h-[42px]"
            >
              <Layers className="w-4 h-4 text-amber-700" />
              <span>✓ + Catalogue Mpya</span>
            </button>
          )}

          {isLocked ? (
            <button
              type="button"
              onClick={() => handleLockedControlClick('CREATE_LISTING')}
              className="py-2.5 px-4 text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer min-h-[42px] bg-amber-50 text-amber-950 border border-amber-300 hover:bg-amber-100"
            >
              <Lock className="w-4 h-4 text-amber-700" />
              <span>
                🔒 Weka Tangazo la Bidhaa (
                {currentStatus === 'NOT_ACTIVATED'
                  ? 'Washa Free Trial ili kuuza kwenye Gulio'
                  : 'Lipa TSh 1,000'}
                )
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreateProductClick}
              className="py-2.5 px-4 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer min-h-[42px] bg-amber-800 hover:bg-amber-900 text-white"
            >
              <Plus className="w-4 h-4" />
              <span>✓ + Weka Bidhaa Mpya</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('products')}
          className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeSubTab === 'products'
              ? 'bg-amber-900 text-white shadow-xs'
              : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Bidhaa Zangu ({myProducts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('catalogues')}
          className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeSubTab === 'catalogues'
              ? 'bg-amber-900 text-white shadow-xs'
              : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Catalogues Zangu ({catalogues.length})</span>
        </button>
      </div>

      {/* Tab 1: Products Tab */}
      {activeSubTab === 'products' && (
        <div className="space-y-4">
          {/* Catalogue Filter Ribbon */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedFilterCatalogue('all')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                selectedFilterCatalogue === 'all'
                  ? 'bg-stone-900 text-white'
                  : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
              }`}
            >
              <span>Zote ({myProducts.length})</span>
            </button>

            {catalogues.map((cat) => {
              const count = myProducts.filter((p) => p.catalogueId === cat.catalogueId).length;
              return (
                <button
                  key={cat.catalogueId}
                  type="button"
                  onClick={() => setSelectedFilterCatalogue(cat.catalogueId)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                    selectedFilterCatalogue === cat.catalogueId
                      ? 'bg-stone-900 text-white'
                      : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
                  }`}
                >
                  <span>{cat.icon || '📁'}</span>
                  <span>{cat.name} ({count})</span>
                </button>
              );
            })}

            {uncategorizedCount > 0 && catalogues.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedFilterCatalogue('uncategorized')}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  selectedFilterCatalogue === 'uncategorized'
                    ? 'bg-stone-900 text-white'
                    : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
                }`}
              >
                <span>🏷️</span>
                <span>Bila Catalogue ({uncategorizedCount})</span>
              </button>
            )}
          </div>

          {/* Product List / Grid */}
          {displayedProducts.length === 0 ? (
            <div className="p-10 text-center bg-white rounded-3xl border border-stone-200 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center mx-auto text-xl">
                📦
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-stone-900">
                  Hakuna Bidhaa Katika Sehemu Hii
                </h4>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Weka bidhaa yako ya kwanza au panga bidhaa zilizopo kwenye catalogue hii.
                </p>
              </div>
              {isLocked ? (
                <button
                  type="button"
                  onClick={() => handleLockedControlClick('CREATE_LISTING')}
                  className="py-2.5 px-4 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    🔒 Weka Tangazo la Bidhaa (
                    {currentStatus === 'NOT_ACTIVATED'
                      ? 'Washa Free Trial ili kuuza kwenye Gulio'
                      : 'Lipa TSh 1,000'}
                    )
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCreateProduct}
                  className="py-2.5 px-4 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>✓ Weka Tangazo la Bidhaa</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedProducts.map((product) => {
                const assignedCat = catalogues.find((c) => c.catalogueId === product.catalogueId);

                return (
                  <div key={product.productId} className="flex flex-col">
                    <ProductCard
                      product={product}
                      isOwner={true}
                      onViewDetails={onViewProductDetails}
                      onEdit={isLocked ? () => handleLockedControlClick('CREATE_LISTING') : onEditProduct}
                      onDelete={onDeleteProduct}
                      onToggleStatus={onToggleProductStatus}
                    />

                    {/* Quick Move / Assign Catalogue Helper Bar under card */}
                    {catalogues.length > 0 && (
                      <div className="mt-1 px-3 py-1.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between text-[11px]">
                        <span className="text-stone-500 font-medium truncate flex items-center gap-1">
                          <FolderInput className="w-3 h-3 text-stone-400 shrink-0" />
                          <span>
                            {assignedCat ? `${assignedCat.icon || '📁'} ${assignedCat.name}` : 'Bila Catalogue'}
                          </span>
                        </span>

                        <select
                          disabled={isLocked}
                          value={product.catalogueId || ''}
                          onChange={(e) => {
                            if (isLocked) {
                              handleLockedControlClick('CATALOGUES');
                              return;
                            }
                            const val = e.target.value;
                            onMoveProductCatalogue(product.productId, val ? val : null);
                          }}
                          className={`bg-white border border-stone-300 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-stone-800 focus:outline-none ${
                            isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          <option value="">-- Weka Bila Catalogue --</option>
                          {catalogues.map((c) => (
                            <option key={c.catalogueId} value={c.catalogueId}>
                              {c.icon} {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Catalogues Manager */}
      {activeSubTab === 'catalogues' && (
        <div className="space-y-4">
          {isLocked && (
            <div className="bg-amber-50/95 border border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center shrink-0 font-bold">
                  🔒
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-extrabold text-amber-950">
                    🔒 Catalogues Zimefungwa
                  </h4>
                  <p className="text-xs text-amber-900">
                    {currentStatus === 'NOT_ACTIVATED'
                      ? 'Washa Free Trial ili kutumia Catalogues na kupanga bidhaa zako dukan mwako.'
                      : 'Lipa TSh 1,000 ili kuendelea kutumia Catalogues na kuweka bidhaa hewani.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleLockedControlClick('CATALOGUES')}
                className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-xs shrink-0 cursor-pointer"
              >
                {currentStatus === 'NOT_ACTIVATED' ? 'Washa Free Trial' : 'Lipa TSh 1,000'}
              </button>
            </div>
          )}

          <div className={isLocked ? 'pointer-events-none opacity-60 filter blur-[0.5px] select-none' : ''}>
            <CatalogueManager
              catalogues={catalogues}
              products={myProducts}
              onCreateCatalogue={isLocked ? () => handleLockedControlClick('CATALOGUES') : onCreateCatalogue}
              onEditCatalogue={isLocked ? () => handleLockedControlClick('CATALOGUES') : onEditCatalogue}
              onDeleteCatalogue={onDeleteCatalogue}
              onReorderCatalogues={onReorderCatalogues}
              onToggleActive={onToggleCatalogueActive}
            />
          </div>
        </div>
      )}

      {/* V1.10A-CORRECTIVE-5: Unified Free Trial Activation Modal */}
      <FreeTrialActivationModal
        isOpen={isFreeTrialModalOpen}
        sellerUserId={shop.sellerId}
        sellerProfileId={shop.shopId}
        originAction={trialOriginAction}
        onClose={() => setIsFreeTrialModalOpen(false)}
        onSuccess={handleTrialSuccess}
      />

      {/* V1.10A-CORRECTIVE-5: Payment Required Modal for GRACE_PERIOD / EXPIRED Sellers */}
      <PaymentRequiredModal
        isOpen={isPaymentModalOpen}
        status={currentStatus}
        onClose={() => setIsPaymentModalOpen(false)}
        onProceedToPayment={() => {
          setIsPaymentModalOpen(false);
          const el = document.getElementById('seller-payment-form');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />
    </div>
  );
};
