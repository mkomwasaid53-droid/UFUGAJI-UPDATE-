import React, { useState, useEffect, useRef } from 'react';
import {
  Video as VideoIcon,
  AlertTriangle,
  RefreshCw,
  DownloadCloud,
  CheckCircle2,
  HardDrive,
  Cloud
} from 'lucide-react';
import { ProductVideo } from '../../types/marketplace';
import {
  getVideoFromIndexedDB,
  loadVideoFromFirestore,
  syncBlobToServerCache
} from '../../services/videoStorageService';

interface ProductVideoPlayerProps {
  video: ProductVideo;
  productTitle: string;
  className?: string;
  autoPlay?: boolean;
}

export const ProductVideoPlayer: React.FC<ProductVideoPlayerProps> = ({
  video,
  productTitle,
  className = '',
  autoPlay = false
}) => {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'indexeddb' | 'server' | 'firestore' | 'raw'>('server');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeBlobUrl, setActiveBlobUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activeBlobUrl) {
        try {
          URL.revokeObjectURL(activeBlobUrl);
        } catch {}
      }
    };
  }, [activeBlobUrl]);

  // Resolution pipeline on load or when video changes
  useEffect(() => {
    let isCancelled = false;

    async function initializeVideoPlayback() {
      setHasError(false);
      setErrorMessage(null);
      setIsRestoring(false);
      setRestoreProgress(0);

      // Priority 1: Check client IndexedDB (instant zero-latency local playback)
      try {
        const localBlob = await getVideoFromIndexedDB(video.id);
        if (!isCancelled && localBlob && localBlob.size > 0) {
          const blobUrl = URL.createObjectURL(localBlob);
          setActiveBlobUrl(blobUrl);
          setActiveUrl(blobUrl);
          setSourceType('indexeddb');
          return;
        }
      } catch (err) {
        console.warn('IndexedDB check notice:', err);
      }

      // Priority 2: Use direct video URL (e.g. server stream /api/videos/... or /uploads/videos/...)
      if (!isCancelled) {
        if (video.url) {
          setActiveUrl(video.url);
          setSourceType('server');
        } else {
          // If no direct URL, immediately trigger Firestore cloud restore
          triggerCloudRestore();
        }
      }
    }

    initializeVideoPlayback();

    return () => {
      isCancelled = true;
    };
  }, [video.id, video.url]);

  // Self-healing: Restore video binary from Firestore permanent cloud chunks
  const triggerCloudRestore = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    setRestoreProgress(5);
    setHasError(false);
    setErrorMessage(null);

    try {
      const restoredBlob = await loadVideoFromFirestore(video.id, (progress) => {
        if (isMountedRef.current) {
          setRestoreProgress(Math.max(5, progress));
        }
      });

      if (!isMountedRef.current) return;

      if (restoredBlob && restoredBlob.size > 0) {
        const blobUrl = URL.createObjectURL(restoredBlob);
        setActiveBlobUrl(blobUrl);
        setActiveUrl(blobUrl);
        setSourceType('firestore');
        setIsRestoring(false);
        setHasError(false);

        // Warm up server cache in background
        syncBlobToServerCache(video.id, restoredBlob).catch(() => {});
      } else {
        setIsRestoring(false);
        setHasError(true);
        setErrorMessage(
          'Video hii haikupatikana kwenye seva au hifadhi ya mtandao. Huenda ilifutwa na muuzaji.'
        );
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setIsRestoring(false);
      setHasError(true);
      setErrorMessage(err?.message || 'Imeshindikana kupakia video kutoka kwenye hifadhi ya mtandao.');
    }
  };

  // Video element error handler: If server URL returns 404 (e.g. server restarted), heal automatically
  const handleVideoError = () => {
    if (sourceType === 'server' && !isRestoring) {
      console.warn('Server video stream unavailable (likely fresh container restart). Restoring from permanent cloud storage...');
      triggerCloudRestore();
    } else if (!isRestoring) {
      setHasError(true);
      setErrorMessage('Hitilafu ya kucheza video. Tafadhali bonyeza kitufe cha kujaribu tena hapa chini.');
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Video Container Box */}
      <div className="relative w-full rounded-xl overflow-hidden bg-black border border-stone-800 aspect-video flex items-center justify-center group shadow-md">
        {/* Restoring progress overlay */}
        {isRestoring && (
          <div className="absolute inset-0 z-20 bg-stone-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center">
            <div className="w-12 h-12 rounded-full border-3 border-amber-500/30 border-t-amber-500 animate-spin flex items-center justify-center mb-3">
              <DownloadCloud className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-sm font-semibold text-white mb-1">
              Inapakua video kutoka kwenye hifadhi ya kudumu...
            </p>
            <p className="text-xs text-stone-400 max-w-xs mb-3">
              Kuhakikisha video haipotei hata baada ya seva kuwashwa upya.
            </p>
            {/* Progress bar */}
            <div className="w-full max-w-xs bg-stone-800 rounded-full h-2 overflow-hidden border border-stone-700">
              <div
                className="bg-amber-500 h-full transition-all duration-300 ease-out"
                style={{ width: `${restoreProgress}%` }}
              />
            </div>
            <span className="text-[11px] font-mono text-amber-300 font-bold mt-1.5">
              {restoreProgress}%
            </span>
          </div>
        )}

        {/* Normal video player when URL is available and no error */}
        {activeUrl && !hasError ? (
          <video
            ref={videoRef}
            src={activeUrl}
            poster={video.thumbnailUrl}
            preload="metadata"
            controls
            playsInline
            autoPlay={autoPlay}
            onError={handleVideoError}
            className="w-full h-full object-contain"
            aria-label={video.title || `Video ya ${productTitle}`}
          >
            Kivinjari chako hakiwezi kucheza video hii moja kwa moja.
          </video>
        ) : hasError ? (
          // Error Box with Retry Option
          <div className="p-4 sm:p-6 text-center text-stone-300 flex flex-col items-center justify-center max-w-md">
            {video.thumbnailUrl && (
              <div className="relative w-32 h-20 rounded-lg overflow-hidden mb-3 border border-stone-700 opacity-60">
                <img
                  src={video.thumbnailUrl}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex items-center gap-1.5 text-amber-400 text-xs sm:text-sm font-bold mb-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Video Haiwezi Kuchezwa Moja kwa Moja</span>
            </div>
            <p className="text-xs text-stone-400 mb-3 leading-relaxed">
              {errorMessage || 'Video haipatikani kwenye mtandao kwa sasa. Unaweza kujaribu kupakua upya.'}
            </p>
            <button
              type="button"
              onClick={triggerCloudRestore}
              disabled={isRestoring}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 active:scale-98 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
              <span>Pakua Upya kutoka Cloud</span>
            </button>
          </div>
        ) : (
          // Loading initial poster/state
          <div className="flex flex-col items-center justify-center text-stone-400 text-xs gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
            <span>Inaandaa kicheza video...</span>
          </div>
        )}
      </div>

      {/* Storage indicator footer */}
      <div className="flex items-center justify-between text-[11px] text-stone-400 px-1">
        <div className="flex items-center gap-1.5">
          {sourceType === 'indexeddb' ? (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
              <HardDrive className="w-3 h-3" />
              <span>Imehifadhiwa (IndexedDB)</span>
            </span>
          ) : sourceType === 'firestore' ? (
            <span className="inline-flex items-center gap-1 text-sky-400 font-medium">
              <Cloud className="w-3 h-3" />
              <span>Hifadhi ya Kudumu (Firestore)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-stone-300 font-medium">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Hifadhi Imara</span>
            </span>
          )}
        </div>

        {video.durationSeconds && video.durationSeconds > 0 && (
          <span className="font-mono text-stone-400">
            Muda: {Math.floor(video.durationSeconds / 60)}:
            {(video.durationSeconds % 60).toString().padStart(2, '0')}
          </span>
        )}
      </div>
    </div>
  );
};
