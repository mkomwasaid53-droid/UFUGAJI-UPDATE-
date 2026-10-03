import React, { useState, useEffect, useMemo } from 'react';
import {
  Star,
  MessageSquare,
  AlertTriangle,
  ShieldCheck,
  Flag,
  Edit2,
  Trash2,
  CornerDownRight,
  Send,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Info
} from 'lucide-react';
import {
  MarketplaceReview,
  ReputationSummary,
  ReviewEligibilityResult,
  ValidRatingValue,
  ReviewTargetType
} from '../../types/marketplaceReview';
import {
  fetchReviewsForTarget,
  calculateReputationSummary,
  checkReviewEligibility,
  submitMarketplaceReview,
  updateMarketplaceReview,
  deleteMarketplaceReview,
  submitSellerResponse,
  validateRatingValue,
  getAIReviewSummary
} from '../../services/marketplaceReviewService';
import { ReportModal } from './ReportModal';
import { auth } from '../../lib/firebase';

interface ProductReviewsSectionProps {
  targetType: ReviewTargetType;
  targetId: string;
  sellerId: string;
  shopId?: string | null;
  productId?: string | null;
  targetTitle?: string;
  isOwner?: boolean;
}

export const ProductReviewsSection: React.FC<ProductReviewsSectionProps> = ({
  targetType,
  targetId,
  sellerId,
  shopId,
  productId,
  targetTitle,
  isOwner
}) => {
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Review Form state
  const [showForm, setShowForm] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [ratingInput, setRatingInput] = useState<number>(5);
  const [titleInput, setTitleInput] = useState('');
  const [bodyInput, setBodyInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Seller Response state
  const [respondingToReviewId, setRespondingToReviewId] = useState<string | null>(null);
  const [sellerResponseText, setSellerResponseText] = useState('');
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  // Reporting state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTargetType, setReportTargetType] = useState<'REVIEW' | 'PRODUCT'>('REVIEW');
  const [reportTargetId, setReportTargetId] = useState<string>('');
  const [reportTargetTitle, setReportTargetTitle] = useState<string>('');

  // AI Summary state
  const [showAISummary, setShowAISummary] = useState(false);

  const currentUserId = auth.currentUser?.uid;
  const currentUserDisplayName = auth.currentUser?.displayName || 'Mfugaji';

  // Load reviews on mount or target change
  const loadReviews = async () => {
    setIsLoading(true);
    try {
      const data = await fetchReviewsForTarget(targetType, targetId);
      setReviews(data);
    } catch (err) {
      console.warn('Hitilafu ya kupata reviews:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [targetType, targetId]);

  // Derived reputation metrics
  const reputation = useMemo<ReputationSummary>(() => {
    return calculateReputationSummary(reviews, targetType, targetId);
  }, [reviews, targetType, targetId]);

  // Check user eligibility
  const [eligibility, setEligibility] = useState<ReviewEligibilityResult>({
    state: 'UNKNOWN',
    canReview: false,
    reasonText: ''
  });

  useEffect(() => {
    checkReviewEligibility(currentUserId, targetType, targetId, sellerId).then((res) => {
      setEligibility(res);
      if (res.existingReview && !editingReviewId) {
        // Pre-fill if editing own review
        setRatingInput(res.existingReview.rating);
        setTitleInput(res.existingReview.title);
        setBodyInput(res.existingReview.body);
      }
    });
  }, [currentUserId, targetType, targetId, sellerId, reviews, editingReviewId]);

  // Handle Review Submission (Create or Update)
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    if (!currentUserId) {
      setActionError('Tafadhali ingia kwenye akaunti yako ili kutoa tathmini.');
      return;
    }

    if (currentUserId === sellerId) {
      setActionError('Huwezi kutoa tathmini kwa bidhaa au duka lako mwenyewe.');
      return;
    }

    const ratingCheck = validateRatingValue(ratingInput);
    if (!ratingCheck.valid || ratingCheck.value === undefined) {
      setActionError(ratingCheck.error || 'Tathmini ya nyota haiko sahihi.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingReviewId) {
        await updateMarketplaceReview(currentUserId, editingReviewId, {
          rating: ratingCheck.value,
          title: titleInput,
          body: bodyInput
        });
        setActionSuccess('Tathmini yako imesasishwa kikamilifu!');
      } else {
        await submitMarketplaceReview(currentUserId, currentUserDisplayName, {
          targetType,
          targetId,
          sellerId,
          shopId: shopId || null,
          productId: productId || null,
          rating: ratingCheck.value,
          title: titleInput,
          body: bodyInput
        });
        setActionSuccess('Tathmini yako imechapishwa kikamilifu!');
      }

      setShowForm(false);
      setEditingReviewId(null);
      await loadReviews();
    } catch (err: any) {
      setActionError(err.message || 'Haikuweza kuhifadhi tathmini.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Review Deletion
  const handleDeleteReview = async (reviewId: string) => {
    if (!currentUserId) return;
    if (!window.confirm('Una uhakika unataka kufuta tathmini yako?')) return;

    try {
      await deleteMarketplaceReview(currentUserId, reviewId);
      setActionSuccess('Tathmini yako imeondolewa.');
      await loadReviews();
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu ya kufuta tathmini.');
    }
  };

  // Handle Seller Response Submission
  const handleSellerResponseSubmit = async (reviewId: string) => {
    if (!currentUserId) return;
    setIsSubmittingResponse(true);
    try {
      await submitSellerResponse(currentUserId, reviewId, sellerResponseText.trim());
      setActionSuccess('Mwitikio wa muuzaji umehifadhiwa kikamilifu.');
      setRespondingToReviewId(null);
      setSellerResponseText('');
      await loadReviews();
    } catch (err: any) {
      setActionError(err.message || 'Hitilafu ya kuhifadhi jibu la muuzaji.');
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  // AI Summary derivation
  const aiSummary = useMemo(() => {
    return getAIReviewSummary(targetType, targetId, reviews);
  }, [targetType, targetId, reviews]);

  const renderStars = (rating: number, interactive: boolean = false) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((starVal) => {
          const isFilled = starVal <= rating;
          return interactive ? (
            <button
              key={starVal}
              type="button"
              onClick={() => setRatingInput(starVal)}
              className="p-1 hover:scale-110 transition-transform cursor-pointer"
              title={`Nyota ${starVal}`}
            >
              <Star
                className={`w-5 h-5 ${
                  isFilled
                    ? 'text-amber-500 fill-amber-500'
                    : 'text-stone-300 hover:text-amber-400'
                }`}
              />
            </button>
          ) : (
            <Star
              key={starVal}
              className={`w-3.5 h-3.5 ${
                isFilled ? 'text-amber-500 fill-amber-500' : 'text-stone-300'
              }`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 pt-3 border-t border-stone-200">
      {/* Section Header with Title & Action */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Tathmini & Uzoefu wa Wanunuzi (Reviews & Reputation)
            </h4>
            <p className="text-[11px] text-stone-500">
              Maoni halisi kutoka kwa wafugaji na wanunuzi wengine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Report Listing button */}
          <button
            type="button"
            onClick={() => {
              setReportTargetType('PRODUCT');
              setReportTargetId(targetId);
              setReportTargetTitle(targetTitle || 'Tangazo Hili');
              setReportModalOpen(true);
            }}
            className="px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:text-rose-700 bg-stone-100 hover:bg-rose-50 border border-stone-200 hover:border-rose-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            title="Ripoti ukiukwaji au taarifa za uongo kwenye tangazo hili"
          >
            <Flag className="w-3 h-3 text-stone-500" />
            <span>Ripoti Tangazo</span>
          </button>

          {/* AI Summary Toggle */}
          {reputation.hasReviews && (
            <button
              type="button"
              onClick={() => setShowAISummary(!showAISummary)}
              className="px-2.5 py-1 text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-amber-600" />
              <span>{showAISummary ? 'Ficha Muhtasari wa AI' : 'Muhtasari wa AI'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Messages */}
      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 font-bold hover:underline text-[11px]"
          >
            Funga
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 font-bold hover:underline text-[11px]"
          >
            Sawa
          </button>
        </div>
      )}

      {/* AI Summary Card (If toggled and reviews exist) */}
      {showAISummary && aiSummary.hasSufficientData && (
        <div className="p-3.5 bg-linear-to-br from-amber-50/90 to-stone-50 rounded-2xl border border-amber-300/80 space-y-2 text-xs text-stone-800">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <Sparkles className="w-4 h-4 text-amber-700" />
            <span>Muhtasari wa Uzoefu wa Wanunuzi (AI Synthesis ya Reviews Halisi):</span>
          </div>
          <p className="leading-relaxed text-stone-700">{aiSummary.summaryText}</p>
          <div className="pt-1 border-t border-amber-200/60 text-[10px] text-stone-500 italic">
            {aiSummary.disclaimer}
          </div>
        </div>
      )}

      {/* Reputation Summary Card */}
      <div className="p-4 bg-stone-50/90 rounded-2xl border border-stone-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          {/* Main Average Score */}
          <div className="text-center sm:text-left space-y-1 sm:border-r sm:border-stone-200 sm:pr-4">
            <div className="text-xs text-stone-500 font-bold">Wastani wa Tathmini:</div>
            {reputation.hasReviews && reputation.averageRating !== null ? (
              <div className="flex items-baseline justify-center sm:justify-start gap-2">
                <span className="text-3xl font-black text-stone-900 tracking-tight">
                  {reputation.averageRating.toFixed(1)}
                </span>
                <span className="text-xs text-stone-500 font-bold">/ 5.0</span>
                <div className="ml-1">{renderStars(Math.round(reputation.averageRating))}</div>
              </div>
            ) : (
              <div className="py-1">
                <span className="text-sm font-bold text-stone-600 bg-stone-200/70 px-2.5 py-1 rounded-lg">
                  Hakuna tathmini bado
                </span>
              </div>
            )}
            <div className="text-[11px] text-stone-500">
              {reputation.totalPublishedReviews > 0
                ? `Jumla ya tathmini zilizochapishwa: ${reputation.totalPublishedReviews}`
                : 'Kuwa wa kwanza kutoa uzoefu wako wa bidhaa hii'}
            </div>
          </div>

          {/* Star Rating Breakdown Bar */}
          <div className="sm:col-span-2 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = reputation.ratingDistribution[star as ValidRatingValue] || 0;
              const percent =
                reputation.totalPublishedReviews > 0
                  ? Math.round((count / reputation.totalPublishedReviews) * 100)
                  : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-stone-600 font-medium flex items-center gap-1 shrink-0">
                    <span>{star}</span>
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                  </span>
                  <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-8 text-[11px] text-stone-500 text-right shrink-0">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Small Sample Warning (Crucial trust mandate: 1-2 reviews) */}
        {reputation.isSmallSample && reputation.smallSampleWarning && (
          <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-300 text-amber-950 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong>Ilani ya Sampuli Ndogo:</strong> {reputation.smallSampleWarning}
            </p>
          </div>
        )}

        {/* Reputational Boundary / Disclaimer */}
        <div className="pt-2 border-t border-stone-200/80 text-[10px] text-stone-500 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.2" />
          <span>{reputation.reputationDisclaimer}</span>
        </div>
      </div>

      {/* Review CTA & Form Toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
            Maoni & Tathmini ({reviews.length})
          </h5>

          {/* If user is the owner: Show blocked self-review notice */}
          {currentUserId === sellerId ? (
            <span className="text-[11px] text-stone-600 bg-stone-100 px-2 py-1 rounded-md border border-stone-200 font-medium">
              Huwezi kutoa tathmini kwa bidhaa yako mwenyewe
            </span>
          ) : eligibility.existingReview ? (
            <button
              type="button"
              onClick={() => {
                setEditingReviewId(eligibility.existingReview?.reviewId || null);
                setRatingInput(eligibility.existingReview?.rating || 5);
                setTitleInput(eligibility.existingReview?.title || '');
                setBodyInput(eligibility.existingReview?.body || '');
                setShowForm(!showForm);
              }}
              className="text-xs font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{showForm ? 'Funga Fomu' : 'Hariri Tathmini Yako'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <Star className="w-3.5 h-3.5 text-amber-200 fill-amber-200" />
              <span>{showForm ? 'Funga Fomu' : 'Andika Tathmini'}</span>
            </button>
          )}
        </div>

        {/* Self Review Protection Message if owner attempts */}
        {currentUserId === sellerId && showForm && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-amber-950 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p>
              <strong>Ulinzi wa Uaminifu:</strong> Mfumo unazuia wauzaji kutoa tathmini au nyota kwa bidhaa zao wenyewe. Kama muuzaji, unaweza kujibu maoni ya wanunuzi kupitia kitufe cha &quot;Mwitikio wa Muuzaji&quot;.
            </p>
          </div>
        )}

        {/* Review Form (Authenticated buyers only, no self-reviews) */}
        {showForm && currentUserId !== sellerId && (
          <form
            onSubmit={handleSubmitReview}
            className="p-4 bg-white rounded-2xl border border-stone-300 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <span className="text-xs font-bold text-stone-900">
                {editingReviewId ? 'Hariri Tathmini Yako' : 'Wasilisha Tathmini ya Uzoefu Wako'}
              </span>
              <span className="text-[11px] text-stone-500">
                Kama: <strong className="text-stone-800">{currentUserDisplayName}</strong>
              </span>
            </div>

            {/* Interactive Rating Selector */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-700 block">
                Chagua Nyota (Kiwango cha Kuridhika 1 hadi 5):
              </label>
              <div className="flex items-center gap-2">
                {renderStars(ratingInput, true)}
                <span className="text-xs font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  {ratingInput === 5
                    ? '5 - Bora Sana (Excellent)'
                    : ratingInput === 4
                    ? '4 - Nzuri (Good)'
                    : ratingInput === 3
                    ? '3 - Wastani (Average)'
                    : ratingInput === 2
                    ? '2 - Chini ya Matarajio (Below Average)'
                    : '1 - Haikuridhisha (Poor)'}
                </span>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-700 block">
                Kichwa cha Tathmini (Mfano: Vifaranga wamekua vizuri):
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Andika muhtasari mfupi..."
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-stone-900"
              />
            </div>

            {/* Body */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-700 block">
                Maelezo ya Uzoefu Wako:
              </label>
              <textarea
                required
                rows={4}
                maxLength={1500}
                value={bodyInput}
                onChange={(e) => setBodyInput(e.target.value)}
                placeholder="Eleza jinsi mawasiliano yalivyokuwa, ufikaji wa mzigo, ubora halisi, au ushauri uliopokea..."
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-stone-900 resize-none"
              />
              <div className="text-[10px] text-stone-400 text-right">
                {bodyInput.length}/1500
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingReviewId(null);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              >
                Ghairi
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isSubmitting
                    ? 'Inahifadhi...'
                    : editingReviewId
                    ? 'Sasisha Tathmini'
                    : 'Chapisha Tathmini'}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Reviews List */}
        {isLoading ? (
          <div className="p-6 text-center text-xs text-stone-500">
            Inapakia tathmini za soko...
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-200/80 text-center space-y-1.5">
            <MessageSquare className="w-6 h-6 text-stone-400 mx-auto" />
            <p className="text-xs font-bold text-stone-700">Hakuna tathmini zilizochapishwa bado</p>
            <p className="text-[11px] text-stone-500 max-w-sm mx-auto">
              Kuwa mnunuzi wa kwanza kutoa uzoefu wako halisi kuhusu bidhaa au duka hili baada ya kufanya muamala.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((rev) => {
              const isAuthor = currentUserId && rev.authorUserId === currentUserId;
              const canRespondAsSeller =
                currentUserId &&
                (sellerId === currentUserId || (shopId && shopId === currentUserId)) &&
                !rev.sellerResponse;

              return (
                <div
                  key={rev.reviewId}
                  className="p-4 bg-white rounded-2xl border border-stone-200 space-y-2.5 shadow-2xs"
                >
                  {/* Reviewer Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-stone-900">
                          {rev.authorDisplayName}
                        </span>
                        {isAuthor && (
                          <span className="text-[9px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded">
                            Tathmini Yako
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {renderStars(rev.rating)}
                        <span className="text-[10.5px] text-stone-400">
                          {new Date(rev.createdAt).toLocaleDateString('sw-TZ', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Action Controls for Author & Reporting */}
                    <div className="flex items-center gap-1.5">
                      {isAuthor ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingReviewId(rev.reviewId);
                              setRatingInput(rev.rating);
                              setTitleInput(rev.title);
                              setBodyInput(rev.body);
                              setShowForm(true);
                            }}
                            className="p-1.5 text-stone-500 hover:text-amber-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                            title="Hariri tathmini yako"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteReview(rev.reviewId)}
                            className="p-1.5 text-stone-500 hover:text-rose-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                            title="Futa tathmini yako"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setReportTargetType('REVIEW');
                            setReportTargetId(rev.reviewId);
                            setReportTargetTitle(rev.title);
                            setReportModalOpen(true);
                          }}
                          className="p-1.5 text-stone-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Ripoti tathmini hii kwa ukiukwaji au uongo"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Title & Body */}
                  <div className="space-y-1">
                    <h6 className="text-xs font-bold text-stone-900">{rev.title}</h6>
                    <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line">
                      {rev.body}
                    </p>
                  </div>

                  {/* Existing Seller Response (Separately marked & styled) */}
                  {rev.sellerResponse && (
                    <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 space-y-1 ml-3 mt-2 text-xs">
                      <div className="flex items-center justify-between text-[11px] font-bold text-amber-950">
                        <span className="flex items-center gap-1.5">
                          <CornerDownRight className="w-3.5 h-3.5 text-amber-700" />
                          <span>Mwitikio wa Muuzaji (Official Seller Response):</span>
                        </span>
                        <span className="text-[10px] text-stone-400 font-normal">
                          {rev.sellerResponseCreatedAt
                            ? new Date(rev.sellerResponseCreatedAt).toLocaleDateString('sw-TZ')
                            : ''}
                        </span>
                      </div>
                      <p className="text-stone-800 pl-5 text-[11.5px] leading-relaxed">
                        {rev.sellerResponse}
                      </p>
                    </div>
                  )}

                  {/* Seller Reply CTA if authenticated seller */}
                  {canRespondAsSeller && respondingToReviewId !== rev.reviewId && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRespondingToReviewId(rev.reviewId);
                          setSellerResponseText('');
                        }}
                        className="text-[11px] font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <CornerDownRight className="w-3.5 h-3.5" />
                        <span>Jibu kama Muuzaji (Seller Response)</span>
                      </button>
                    </div>
                  )}

                  {/* Seller Reply Form */}
                  {respondingToReviewId === rev.reviewId && (
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-300 space-y-2 ml-3">
                      <div className="text-xs font-bold text-stone-800">
                        Mwitikio wa Muuzaji kwa Tathmini Hii:
                      </div>
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={sellerResponseText}
                        onChange={(e) => setSellerResponseText(e.target.value)}
                        placeholder="Andika jibu rasmi la duka au shamba lako kwa heshima..."
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-900 resize-none"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setRespondingToReviewId(null)}
                          className="px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Ghairi
                        </button>
                        <button
                          type="button"
                          disabled={isSubmittingResponse || sellerResponseText.trim().length < 3}
                          onClick={() => handleSellerResponseSubmit(rev.reviewId)}
                          className="px-3 py-1 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
                        >
                          {isSubmittingResponse ? 'Inatuma...' : 'Tuma Mwitikio'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Report Modal */}
      <ReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        targetType={reportTargetType}
        targetId={reportTargetId}
        targetTitle={reportTargetTitle}
        onReportSubmitted={() => {
          setActionSuccess('Ripoti imewasilishwa kwa wasimamizi.');
        }}
      />
    </div>
  );
};
