import React, { useState, useEffect, useRef } from 'react';
import {
  MarketplaceConversation,
  MarketplaceMessage,
  ConversationStatus
} from '../../types/marketplaceInbox';
import { marketplaceInboxService } from '../../services/marketplaceInboxService';
import { formatTshPrice } from '../../services/marketplaceService';
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Store,
  User,
  Clock,
  CheckCheck,
  Check,
  Lock,
  Archive,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Search,
  AlertCircle
} from 'lucide-react';

interface MarketplaceInboxViewProps {
  currentUserId: string;
  isSeller?: boolean;
  initialConversationId?: string | null;
  onViewProduct?: (productId: string) => void;
  onBackToMarket?: () => void;
}

export const MarketplaceInboxView: React.FC<MarketplaceInboxViewProps> = ({
  currentUserId,
  isSeller = false,
  initialConversationId = null,
  onViewProduct,
  onBackToMarket
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'BUYER' | 'SELLER'>('ALL');
  const [conversations, setConversations] = useState<MarketplaceConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<MarketplaceConversation | null>(null);
  const [messages, setMessages] = useState<MarketplaceMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations
  const loadConversations = async () => {
    if (!currentUserId) return;
    try {
      setIsLoadingList(true);
      setErrorMsg(null);
      const list = await marketplaceInboxService.getConversationsForUser(currentUserId);
      setConversations(list);

      // If initial conversation provided, auto select it
      if (initialConversationId) {
        const found = list.find((c) => c.conversationId === initialConversationId);
        if (found) {
          setSelectedConversation(found);
        }
      }
    } catch (err: any) {
      console.warn('Hitilafu ya kupakia mazungumzo:', err);
      setErrorMsg(err.message || 'Hitilafu ya kupakia mazungumzo');
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [currentUserId, initialConversationId]);

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedConversation || !currentUserId) return;

    let isMounted = true;
    const loadMessages = async () => {
      try {
        setIsLoadingMessages(true);
        const msgs = await marketplaceInboxService.getMessagesForConversation(
          selectedConversation.conversationId,
          currentUserId
        );

        if (isMounted) {
          setMessages(msgs);
        }

        // Mark as read if user has unread messages
        const isBuyer = currentUserId === selectedConversation.buyerUserId;
        const unreadCount = isBuyer
          ? selectedConversation.buyerUnreadCount
          : selectedConversation.sellerUnreadCount;

        if (unreadCount > 0) {
          const updated = await marketplaceInboxService.markConversationAsRead(
            selectedConversation.conversationId,
            currentUserId
          );
          if (isMounted) {
            setSelectedConversation(updated);
            setConversations((prev) =>
              prev.map((c) => (c.conversationId === updated.conversationId ? updated : c))
            );
          }
        }
      } catch (err: any) {
        console.warn('Hitilafu ya kupakia jumbe:', err);
      } finally {
        if (isMounted) setIsLoadingMessages(false);
      }
    };

    loadMessages();
    return () => {
      isMounted = false;
    };
  }, [selectedConversation?.conversationId, currentUserId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !selectedConversation || isSending) return;

    try {
      setIsSending(true);
      setErrorMsg(null);
      const newMsg = await marketplaceInboxService.sendMessage(
        {
          conversationId: selectedConversation.conversationId,
          senderUserId: currentUserId,
          text
        },
        currentUserId
      );

      setMessages((prev) => [...prev, newMsg]);
      setInputText('');

      // Update conversation in list
      const updatedConv: MarketplaceConversation = {
        ...selectedConversation,
        lastMessage: text.slice(0, 100),
        lastMessageAt: newMsg.createdAt,
        updatedAt: newMsg.createdAt,
        buyerUnreadCount:
          currentUserId === selectedConversation.sellerUserId
            ? (selectedConversation.buyerUnreadCount || 0) + 1
            : selectedConversation.buyerUnreadCount,
        sellerUnreadCount:
          currentUserId === selectedConversation.buyerUserId
            ? (selectedConversation.sellerUnreadCount || 0) + 1
            : selectedConversation.sellerUnreadCount
      };

      setSelectedConversation(updatedConv);
      setConversations((prev) =>
        prev.map((c) => (c.conversationId === updatedConv.conversationId ? updatedConv : c))
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Hitilafu ya kutuma ujumbe');
    } finally {
      setIsSending(false);
    }
  };

  // Lifecycle status change (CLOSE / BLOCK / ACTIVATE)
  const handleUpdateStatus = async (status: ConversationStatus) => {
    if (!selectedConversation) return;
    try {
      const updated = await marketplaceInboxService.updateConversationStatus(
        selectedConversation.conversationId,
        status,
        currentUserId
      );
      setSelectedConversation(updated);
      setConversations((prev) =>
        prev.map((c) => (c.conversationId === updated.conversationId ? updated : c))
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Hitilafu ya kubadili hali ya mazungumzo');
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (activeTab === 'BUYER' && c.buyerUserId !== currentUserId) return false;
    if (activeTab === 'SELLER' && c.sellerUserId !== currentUserId) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (c.productTitleSnapshot || '').toLowerCase().includes(q);
      const matchSeller = (c.sellerNameSnapshot || '').toLowerCase().includes(q);
      const matchBuyer = (c.buyerNameSnapshot || '').toLowerCase().includes(q);
      const matchLast = (c.lastMessage || '').toLowerCase().includes(q);
      return matchTitle || matchSeller || matchBuyer || matchLast;
    }
    return true;
  });

  const totalBuyerUnread = conversations
    .filter((c) => c.buyerUserId === currentUserId)
    .reduce((sum, c) => sum + (c.buyerUnreadCount || 0), 0);

  const totalSellerUnread = conversations
    .filter((c) => c.sellerUserId === currentUserId)
    .reduce((sum, c) => sum + (c.sellerUnreadCount || 0), 0);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Sasa hivi';
      if (diffMins < 60) return `Dakika ${diffMins} zilizopita`;
      if (diffHours < 24) return `Saa ${diffHours} zilizopita`;
      if (diffDays === 1) return 'Jana';
      if (diffDays < 7) return `Siku ${diffDays} zilizopita`;
      return date.toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <div className="bg-stone-50 min-h-[600px] rounded-3xl border border-stone-200 overflow-hidden flex flex-col md:flex-row shadow-sm">
      {/* ------------------------------------------------------------- */}
      {/* LEFT COLUMN: CONVERSATION LIST */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`w-full md:w-80 lg:w-96 bg-white border-r border-stone-200 flex flex-col shrink-0 ${
          selectedConversation ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Top Header */}
        <div className="p-4 border-b border-stone-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {onBackToMarket && (
                <button
                  type="button"
                  onClick={onBackToMarket}
                  className="p-1.5 -ml-1 text-stone-500 hover:text-stone-800 rounded-lg transition-colors cursor-pointer"
                  title="Rudi Sokoni"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-emerald-700" />
                <span>Ujumbe wa Gulio</span>
              </h2>
            </div>

            <button
              type="button"
              onClick={loadConversations}
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg transition-colors cursor-pointer"
              title="Pakia Upya"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Role Filter Tabs */}
          <div className="flex bg-stone-100 p-1 rounded-xl gap-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center ${
                activeTab === 'ALL'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Zote ({conversations.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('BUYER')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center relative ${
                activeTab === 'BUYER'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Kama Mnunuzi
              {totalBuyerUnread > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-emerald-600 text-white text-[10px] rounded-full">
                  {totalBuyerUnread}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('SELLER')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all cursor-pointer text-center relative ${
                activeTab === 'SELLER'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Kama Muuzaji
              {totalSellerUnread > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-600 text-white text-[10px] rounded-full">
                  {totalSellerUnread}
                </span>
              )}
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tafuta mazungumzo..."
              className="w-full pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-stone-100 max-h-[550px]">
          {isLoadingList ? (
            <div className="p-8 text-center space-y-2">
              <RefreshCw className="w-6 h-6 text-emerald-700 animate-spin mx-auto" />
              <p className="text-xs text-stone-500">Inapakia mazungumzo...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="w-10 h-10 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center mx-auto">
                <MessageSquare className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-stone-700">Hakuna Mazungumzo</p>
              <p className="text-[11px] text-stone-400 max-w-[200px] mx-auto leading-relaxed">
                {activeTab === 'SELLER'
                  ? 'Bado hakuna mnunuzi aliyetuma ujumbe kwenye bidhaa zako.'
                  : 'Bado hujaanzisha mazungumzo na muuzaji yeyote.'}
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConversation?.conversationId === conv.conversationId;
              const isCallerBuyer = conv.buyerUserId === currentUserId;
              const otherPartyName = isCallerBuyer
                ? conv.sellerNameSnapshot || 'Muuzaji'
                : conv.buyerNameSnapshot || 'Mnunuzi';
              const unreadCount = isCallerBuyer ? conv.buyerUnreadCount : conv.sellerUnreadCount;

              return (
                <div
                  key={conv.conversationId}
                  onClick={() => setSelectedConversation(conv)}
                  className={`p-3.5 transition-colors cursor-pointer text-left flex gap-3 items-start relative ${
                    isSelected
                      ? 'bg-emerald-50/80 border-l-4 border-l-emerald-700'
                      : 'hover:bg-stone-50'
                  }`}
                >
                  {/* Thumbnail / Avatar */}
                  <div className="w-11 h-11 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                    {conv.imageUrlSnapshot ? (
                      <img
                        src={conv.imageUrlSnapshot}
                        alt={conv.productTitleSnapshot}
                        className="w-full h-full object-cover"
                      />
                    ) : isCallerBuyer ? (
                      <Store className="w-5 h-5 text-stone-400" />
                    ) : (
                      <User className="w-5 h-5 text-stone-400" />
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-stone-900 truncate">
                        {otherPartyName}
                      </h4>
                      <span className="text-[10px] text-stone-400 shrink-0">
                        {formatTime(conv.lastMessageAt || conv.createdAt)}
                      </span>
                    </div>

                    <p className="text-[11px] font-semibold text-stone-700 truncate">
                      {conv.productTitleSnapshot}
                    </p>

                    <p
                      className={`text-xs truncate ${
                        unreadCount > 0 ? 'text-stone-900 font-bold' : 'text-stone-500'
                      }`}
                    >
                      {conv.lastMessage || 'Hakuna ujumbe bado...'}
                    </p>
                  </div>

                  {/* Unread badge & Status pill */}
                  <div className="flex flex-col items-end gap-1 shrink-0 self-center">
                    {unreadCount > 0 && (
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs">
                        {unreadCount}
                      </span>
                    )}
                    {conv.status === 'CLOSED' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-stone-200 text-stone-600">
                        Imefungwa
                      </span>
                    )}
                    {conv.status === 'BLOCKED' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-700">
                        Imezuiwa
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RIGHT COLUMN: ACTIVE CONVERSATION THREAD */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`flex-1 flex flex-col bg-stone-50/50 ${
          !selectedConversation ? 'hidden md:flex' : 'flex'
        }`}
      >
        {selectedConversation ? (
          <>
            {/* Thread Header */}
            <div className="p-3.5 bg-white border-b border-stone-200 flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedConversation(null)}
                  className="md:hidden p-1.5 text-stone-500 hover:text-stone-800 rounded-lg cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {selectedConversation.imageUrlSnapshot ? (
                    <img
                      src={selectedConversation.imageUrlSnapshot}
                      alt={selectedConversation.productTitleSnapshot}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Store className="w-4 h-4 text-stone-400" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-stone-900 truncate">
                      {selectedConversation.buyerUserId === currentUserId
                        ? selectedConversation.sellerNameSnapshot || 'Muuzaji'
                        : selectedConversation.buyerNameSnapshot || 'Mnunuzi'}
                    </h3>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 font-medium">
                      {selectedConversation.buyerUserId === currentUserId ? 'Muuzaji' : 'Mnunuzi'}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 truncate">
                    {selectedConversation.productTitleSnapshot}
                  </p>
                </div>
              </div>

              {/* Status & Action Menu */}
              <div className="flex items-center gap-1.5 shrink-0">
                {selectedConversation.status === 'ACTIVE' ? (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('CLOSED')}
                    className="text-[11px] font-semibold text-stone-500 hover:text-stone-800 px-2 py-1 rounded-lg border border-stone-200 bg-white transition-colors cursor-pointer"
                    title="Funga mazungumzo"
                  >
                    Funga Mazungumzo
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('ACTIVE')}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 transition-colors cursor-pointer"
                  >
                    Fungua Upya
                  </button>
                )}
              </div>
            </div>

            {/* PRODUCT CONTEXT BANNER (Requirement 6) */}
            <div className="p-3 bg-white/90 border-b border-stone-200/80 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0">
                  {selectedConversation.imageUrlSnapshot ? (
                    <img
                      src={selectedConversation.imageUrlSnapshot}
                      alt={selectedConversation.productTitleSnapshot}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-400">
                      <Store className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-0.5">
                  <div className="font-bold text-stone-900 truncate">
                    {selectedConversation.productTitleSnapshot}
                  </div>
                  <div className="text-[11px] text-stone-500 flex items-center gap-2">
                    {selectedConversation.priceSnapshot !== undefined &&
                      selectedConversation.priceSnapshot !== null && (
                        <span className="font-extrabold text-emerald-700">
                          {formatTshPrice(selectedConversation.priceSnapshot)}
                        </span>
                      )}
                    <span>•</span>
                    <span className="truncate">Kategoria: {selectedConversation.categoryId}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">

                {onViewProduct && selectedConversation.productId && (
                  <button
                    type="button"
                    onClick={() => onViewProduct(selectedConversation.productId)}
                    className="py-1.5 px-3 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  >
                    <span>Tazama Tangazo</span>
                    <ExternalLink className="w-3 h-3 text-stone-500" />
                  </button>
                )}
              </div>
            </div>

            {/* SAFETY ADVISORY NOTICE (Requirement 11) */}
            <div className="mx-3 sm:mx-4 mt-2 p-2.5 bg-amber-50/90 border border-amber-200/90 rounded-xl text-[11px] text-amber-950 flex items-start gap-2 shadow-2xs">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <strong className="font-bold">Tahadhari ya Usalama:</strong> Usilipe fedha kabla ya kuona au kukagua mifugo au bidhaa. Wasiliana daima ndani ya mfumo wa Gulio kwa usalama wako.
              </div>
            </div>

            {/* Error notice */}
            {errorMsg && (
              <div className="p-2.5 mx-4 mt-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Messages Thread */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[450px]">
              {isLoadingMessages ? (
                <div className="py-12 text-center space-y-2">
                  <RefreshCw className="w-5 h-5 text-emerald-700 animate-spin mx-auto" />
                  <p className="text-xs text-stone-400">Inapakia jumbe...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="py-10 text-center space-y-4 max-w-sm mx-auto">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-stone-800">
                      Anza Mazungumzo Kuhusu Bidhaa Hii
                    </h4>
                    <p className="text-[11px] text-stone-500 leading-relaxed">
                      Wasiliana moja kwa moja na muuzaji ili kuuliza kuhusu upatikanaji, bei au
                      usafirishaji.
                    </p>
                  </div>

                  {/* Quick Starter Suggestions */}
                  {selectedConversation.buyerUserId === currentUserId && (
                    <div className="space-y-1.5 pt-2 text-left">
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider text-center">
                        Mapendekezo ya maswali ya haraka:
                      </p>
                      <button
                        type="button"
                        onClick={() => handleSendMessage('Habari, je bidhaa hii bado ipo?')}
                        className="w-full text-left p-2.5 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 font-medium transition-colors cursor-pointer"
                      >
                        👋 "Habari, je bidhaa hii bado ipo?"
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendMessage('Habari, je bei ina maelewano?')}
                        className="w-full text-left p-2.5 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 font-medium transition-colors cursor-pointer"
                      >
                        💰 "Habari, je bei ina maelewano?"
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSendMessage('Habari, unaweza kusafirisha mpaka mkoani kwangu?')
                        }
                        className="w-full text-left p-2.5 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 font-medium transition-colors cursor-pointer"
                      >
                        🚚 "Habari, unaweza kusafirisha mpaka mkoani kwangu?"
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderUserId === currentUserId;

                  return (
                    <div
                      key={msg.messageId}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[80%] sm:max-w-[70%] rounded-2xl p-3 text-xs leading-relaxed shadow-2xs ${
                          isMine
                            ? 'bg-emerald-700 text-white rounded-br-xs'
                            : 'bg-white text-stone-900 border border-stone-200 rounded-bl-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      </div>

                      <div className="flex items-center gap-1 mt-1 text-[10px] text-stone-400 px-1">
                        <span>{formatTime(msg.createdAt)}</span>
                        {isMine && (
                          <span>
                            {msg.readAt ? (
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-600 inline" />
                            ) : (
                              <Check className="w-3 h-3 text-stone-400 inline" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            {selectedConversation.status === 'BLOCKED' ? (
              <div className="p-3 bg-stone-100 border-t border-stone-200 text-center text-xs text-stone-500 font-medium flex items-center justify-center gap-2">
                <Lock className="w-4 h-4 text-stone-400" />
                <span>Mazungumzo haya yamezuiwa. Huwezi kutuma ujumbe.</span>
              </div>
            ) : selectedConversation.status === 'CLOSED' ? (
              <div className="p-3 bg-stone-100 border-t border-stone-200 text-center text-xs text-stone-500 font-medium flex items-center justify-center gap-2">
                <Archive className="w-4 h-4 text-stone-400" />
                <span>Mazungumzo yamefungwa. Bonyeza "Fungua Upya" ili kuendelea.</span>
              </div>
            ) : (
              <div className="p-3 bg-white border-t border-stone-200">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Andika ujumbe hapa..."
                    disabled={isSending}
                    className="flex-1 px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white min-h-[44px]"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || isSending}
                    className="py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[44px] shrink-0"
                  >
                    <span>Tuma</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}
          </>
        ) : (
          /* Empty state on right */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-3xl flex items-center justify-center border border-emerald-100">
              <MessageSquare className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-stone-800">Chagua Mazungumzo</h3>
              <p className="text-xs text-stone-400 max-w-xs leading-relaxed">
                Chagua mazungumzo kutoka kwenye orodha kushoto ili kusoma au kuendelea na mawasiliano ya bidhaa.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


