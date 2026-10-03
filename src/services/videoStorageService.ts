import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ProductVideo } from '../types/marketplace';

const IDB_NAME = 'ufugaji_media_db';
const IDB_VERSION = 1;
const IDB_STORE = 'videos';
const CHUNK_SIZE_BYTES = 380 * 1024; // 380KB slice -> ~500KB Base64, well within Firestore 1MB doc limit

/**
 * Open IndexedDB database for local durable binary video storage
 */
function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const dbInstance = event.target.result as IDBDatabase;
      if (!dbInstance.objectStoreNames.contains(IDB_STORE)) {
        dbInstance.createObjectStore(IDB_STORE, { keyPath: 'videoId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Save binary video Blob to client persistent IndexedDB storage
 */
export async function saveVideoToIndexedDB(videoId: string, blob: Blob, mimeType: string): Promise<void> {
  try {
    const idb = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const record = {
        videoId,
        blob,
        mimeType: mimeType || blob.type || 'video/mp4',
        updatedAt: Date.now(),
      };
      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    });
  } catch (err) {
    console.warn('IndexedDB write notice:', err);
  }
}

/**
 * Retrieve binary video Blob from client persistent IndexedDB storage
 */
export async function getVideoFromIndexedDB(videoId: string): Promise<Blob | null> {
  try {
    const idb = await openIndexedDb();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getRequest = store.get(videoId);
      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record && record.blob) {
          resolve(record.blob);
        } else {
          resolve(null);
        }
      };
      getRequest.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Delete video from client IndexedDB storage
 */
export async function deleteVideoFromIndexedDB(videoId: string): Promise<void> {
  try {
    const idb = await openIndexedDb();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(videoId);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {}
}

/**
 * Helper to convert Blob/File slice to Base64 string
 */
function sliceToBase64(slice: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Strip data:url prefix, e.g. "data:application/octet-stream;base64,"
        const commaIndex = reader.result.indexOf(',');
        resolve(commaIndex >= 0 ? reader.result.substring(commaIndex + 1) : reader.result);
      } else {
        reject(new Error('FileReader result is not a string'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(slice);
  });
}

/**
 * Helper to convert Base64 string back to Uint8Array byte buffer
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Save video permanently to Firestore as chunked records
 * This guarantees the video is stored in durable Google Cloud storage and never vanishes
 */
export async function saveVideoToFirestoreChunks(
  videoId: string,
  file: File | Blob,
  metadata: {
    sellerUid: string;
    productId: string;
    fileName?: string;
    title?: string;
    description?: string;
    thumbnailUrl?: string;
    durationSeconds?: number;
  },
  onProgress?: (progressPercent: number) => void
): Promise<void> {
  const totalBytes = file.size;
  const mimeType = file.type || 'video/mp4';
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE_BYTES) || 1;
  const now = new Date().toISOString();

  // Save metadata document first
  const masterDocRef = doc(db, 'marketplaceVideos', videoId);
  await setDoc(masterDocRef, {
    videoId,
    sellerUid: metadata.sellerUid,
    productId: metadata.productId,
    fileName: metadata.fileName || `${videoId}.mp4`,
    mimeType,
    totalBytes,
    totalChunks,
    chunkSize: CHUNK_SIZE_BYTES,
    title: metadata.title || null,
    description: metadata.description || null,
    thumbnailUrl: metadata.thumbnailUrl || null,
    durationSeconds: metadata.durationSeconds || null,
    createdAt: now,
    updatedAt: now,
  });

  // Upload chunks in controlled batches (e.g. 4 chunks at a time) for speed and reliability
  const BATCH_SIZE = 4;
  for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
    const chunkPromises: Promise<void>[] = [];

    for (let j = i; j < Math.min(i + BATCH_SIZE, totalChunks); j++) {
      const start = j * CHUNK_SIZE_BYTES;
      const end = Math.min(start + CHUNK_SIZE_BYTES, totalBytes);
      const slice = file.slice(start, end);

      const uploadTask = async (chunkIndex: number, chunkSlice: Blob) => {
        const base64Data = await sliceToBase64(chunkSlice);
        const chunkDocRef = doc(db, 'marketplaceVideos', videoId, 'chunks', `chunk_${chunkIndex.toString().padStart(5, '0')}`);
        await setDoc(chunkDocRef, {
          videoId,
          chunkIndex,
          data: base64Data,
          size: chunkSlice.size,
          uploadedAt: now,
        });
      };

      chunkPromises.push(uploadTask(j, slice));
    }

    await Promise.all(chunkPromises);

    const completedChunks = Math.min(i + BATCH_SIZE, totalChunks);
    const progressPct = Math.min(99, Math.round((completedChunks / totalChunks) * 100));
    onProgress?.(progressPct);
  }

  onProgress?.(100);
}

/**
 * Load permanently stored video from Firestore chunks and reconstruct binary Blob
 */
export async function loadVideoFromFirestore(
  videoId: string,
  onProgress?: (progressPercent: number) => void
): Promise<Blob | null> {
  try {
    // 1. Fetch metadata doc
    const masterDocRef = doc(db, 'marketplaceVideos', videoId);
    const masterSnap = await getDoc(masterDocRef);

    if (!masterSnap.exists()) {
      return null;
    }

    const masterData = masterSnap.data();
    const mimeType = masterData?.mimeType || 'video/mp4';
    const totalChunks = Number(masterData?.totalChunks) || 0;

    if (totalChunks <= 0) {
      return null;
    }

    // 2. Fetch all chunks
    const chunksCollectionRef = collection(db, 'marketplaceVideos', videoId, 'chunks');
    const chunksQuery = query(chunksCollectionRef, orderBy('chunkIndex', 'asc'));
    const chunksSnapshot = await getDocs(chunksQuery);

    if (chunksSnapshot.empty) {
      return null;
    }

    const chunkBuffers: Uint8Array[] = [];
    let count = 0;

    chunksSnapshot.forEach((chunkDoc) => {
      const chunkData = chunkDoc.data();
      if (chunkData?.data) {
        const bytes = base64ToUint8Array(chunkData.data);
        chunkBuffers.push(bytes);
        count++;
        onProgress?.(Math.min(99, Math.round((count / chunksSnapshot.size) * 100)));
      }
    });

    if (chunkBuffers.length === 0) {
      return null;
    }

    const reconstructedBlob = new Blob(chunkBuffers, { type: mimeType });

    // Cache into IndexedDB for instant playback in future
    saveVideoToIndexedDB(videoId, reconstructedBlob, mimeType).catch(() => {});

    // Try to asynchronously send back to server so disk cache is restored
    syncBlobToServerCache(videoId, reconstructedBlob).catch(() => {});

    onProgress?.(100);
    return reconstructedBlob;
  } catch (err) {
    console.warn('Hitilafu ya kupata video kutoka Firestore:', err);
    return null;
  }
}

/**
 * Re-warm server disk cache with reconstructed video binary so future HTTP Range streaming works
 */
export async function syncBlobToServerCache(videoId: string, blob: Blob): Promise<void> {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload-video-raw', true);
    xhr.setRequestHeader('x-video-id', videoId);
    xhr.setRequestHeader('x-file-name', `${videoId}.mp4`);
    xhr.setRequestHeader('x-mime-type', blob.type || 'video/mp4');
    xhr.send(blob);
  } catch {}
}

/**
 * Delete video permanently from all storage layers:
 * 1. Client IndexedDB
 * 2. Firestore Cloud permanent chunks & metadata
 * 3. Server temporary disk cache
 */
export async function deleteVideoPermanently(videoId: string, storagePath?: string): Promise<void> {
  // 1. Delete from IndexedDB
  await deleteVideoFromIndexedDB(videoId);

  // 2. Delete from Firestore
  try {
    const masterDocRef = doc(db, 'marketplaceVideos', videoId);
    const chunksCollectionRef = collection(db, 'marketplaceVideos', videoId, 'chunks');
    const chunksSnapshot = await getDocs(chunksCollectionRef);

    const deletePromises: Promise<void>[] = [];
    chunksSnapshot.forEach((snap) => {
      deletePromises.push(deleteDoc(snap.ref));
    });
    await Promise.all(deletePromises);
    await deleteDoc(masterDocRef);
  } catch (err) {
    console.warn('Notice removing Firestore video chunks:', err);
  }

  // 3. Delete from server disk cache
  const serverPath = storagePath || `uploads/videos/${videoId}.mp4`;
  try {
    await fetch('/api/upload-media', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: serverPath }),
    });
  } catch {}
}
