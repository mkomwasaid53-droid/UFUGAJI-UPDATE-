import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile as fbUpdateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { classifyFirestoreError } from '../utils/firestoreErrorClassifier';
import { UserProfile, UserRole } from '../types';
import { SellerProfile } from '../types/marketplace';

interface AuthContextType {
  currentUser: FirebaseUser | any | null;
  user: FirebaseUser | any | null; // Alias for currentUser
  userProfile: UserProfile | null;
  profile: UserProfile | null; // Alias for userProfile
  sellerProfile: SellerProfile | null;
  role: UserRole | null;
  loading: boolean;
  isAdmin: boolean;
  isSeller: boolean;
  isFarmer: boolean;
  hasSellerCapability: boolean;
  signup: (
    email: string,
    password: string,
    displayName: string,
    phone?: string,
    location?: string,
    mainLivestock?: string[],
    livestockTypes?: string[]
  ) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginAsAdmin: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveProfile: (updatedData: Partial<UserProfile>) => Promise<void>;
  saveSellerProfileState: (sellerData: Partial<SellerProfile>) => Promise<SellerProfile>;
  updateUserRole: (newRole: UserRole) => Promise<void>;
}

const LOCAL_SELLER_CACHE_PREFIX = 'ufugaji_seller_profiles_cache';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Safe Firestore fetch helper to eliminate network hangs and app freezing
async function safeFirestoreGet<T>(promise: Promise<T>, timeoutMs = 2500): Promise<T | null> {
  let timer: any;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch {
    clearTimeout(timer);
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch or sync user profile document from Firestore
  const fetchUserProfile = async (user: FirebaseUser): Promise<UserProfile | null> => {
    try {
      const userRef = doc(db, 'users', user.uid);
      const snapshot = await safeFirestoreGet(getDoc(userRef), 2500);

      const now = new Date().toISOString();
      let resolvedProfile: UserProfile;

      if (snapshot && snapshot.exists()) {
        const rawData = snapshot.data() as any;
        const resolvedName = rawData.displayName || rawData.name || user.displayName || user.email?.split('@')[0] || 'Mfugaji';
        const resolvedLocation = rawData.location || rawData.region || '';
        const resolvedMainLivestock = Array.isArray(rawData.mainLivestock) && rawData.mainLivestock.length > 0
          ? rawData.mainLivestock
          : rawData.farmingType
            ? [rawData.farmingType]
            : ['kuku'];
        const resolvedLivestockTypes = Array.isArray(rawData.livestockTypes) && rawData.livestockTypes.length > 0
          ? rawData.livestockTypes
          : ['Kuku wa Kienyeji'];

        resolvedProfile = {
          uid: user.uid,
          email: rawData.email || user.email || '',
          role: (rawData.role as UserRole) || 'farmer',
          displayName: resolvedName,
          name: resolvedName,
          phone: rawData.phone || '',
          location: resolvedLocation,
          region: resolvedLocation,
          mainLivestock: resolvedMainLivestock,
          livestockTypes: resolvedLivestockTypes,
          farmingType: resolvedMainLivestock[0] || 'kuku',
          createdAt: rawData.createdAt || now,
          updatedAt: rawData.updatedAt || now,
        };
      } else {
        // Fallback: If document doesn't exist yet, create default farmer profile in Firestore under /users/{uid}
        const defaultName = user.displayName || user.email?.split('@')[0] || 'Mfugaji';
        resolvedProfile = {
          uid: user.uid,
          email: user.email || '',
          role: 'farmer',
          displayName: defaultName,
          name: defaultName,
          phone: '',
          location: '',
          region: '',
          mainLivestock: ['kuku'],
          livestockTypes: ['Kuku wa Kienyeji'],
          farmingType: 'kuku',
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(userRef, resolvedProfile, { merge: true });
      }

      setUserProfile(resolvedProfile);

      // Fetch optional seller capability profile from /users/{uid}/sellerProfile/profile
      await fetchUserSellerProfile(user.uid);

      return resolvedProfile;
    } catch (err) {
      console.error('Hitilafu ya kupata wasifu wa mtumiaji:', err);
      const now = new Date().toISOString();
      const fallbackName = user.displayName || user.email?.split('@')[0] || 'Mfugaji';
      const fallbackProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        role: 'farmer',
        displayName: fallbackName,
        name: fallbackName,
        phone: '',
        location: '',
        region: '',
        mainLivestock: ['kuku'],
        livestockTypes: ['Kuku wa Kienyeji'],
        farmingType: 'kuku',
        createdAt: now,
        updatedAt: now,
      };
      setUserProfile(fallbackProfile);
      return fallbackProfile;
    }
  };

  // Helper to fetch seller profile
  const fetchUserSellerProfile = async (uid: string): Promise<SellerProfile | null> => {
    if (!uid) return null;

    // Check local storage first for instant response
    try {
      const local = localStorage.getItem(`${LOCAL_SELLER_CACHE_PREFIX}_${uid}`);
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && parsed.uid === uid) {
          setSellerProfile(parsed);
        }
      }
    } catch {}

    try {
      const sellerDocRef = doc(db, 'users', uid, 'sellerProfile', 'profile');
      const snap = await safeFirestoreGet(getDoc(sellerDocRef), 1500);
      if (snap && snap.exists()) {
        const sData = snap.data() as SellerProfile;
        setSellerProfile(sData);
        try {
          localStorage.setItem(`${LOCAL_SELLER_CACHE_PREFIX}_${uid}`, JSON.stringify(sData));
        } catch {}
        return sData;
      }
    } catch (err) {
      const classified = classifyFirestoreError(err);
      console.debug(`[${classified.code}] Taarifa ya wasifu wa muuzaji (offline au haijawekwa bado):`, classified.message);
    }
    return null;
  };

  useEffect(() => {
    // Check for saved admin session in localStorage first
    try {
      const savedAdmin = localStorage.getItem('ufugaji_admin_session');
      if (savedAdmin) {
        const parsed = JSON.parse(savedAdmin);
        if (parsed?.profile?.email?.toLowerCase() === 'mkomwasaid53@gmail.com') {
          setCurrentUser(parsed.user);
          setUserProfile(parsed.profile);
        }
      }
    } catch {}

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await fetchUserProfile(user);
      } else {
        // If Firebase Auth has no user, check if admin session is present
        try {
          const savedAdmin = localStorage.getItem('ufugaji_admin_session');
          if (savedAdmin) {
            const parsed = JSON.parse(savedAdmin);
            if (parsed?.profile?.email?.toLowerCase() === 'mkomwasaid53@gmail.com') {
              setCurrentUser(parsed.user);
              setUserProfile(parsed.profile);
              setLoading(false);
              return;
            }
          }
        } catch {}
        setUserProfile(null);
        setSellerProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signup = async (
    email: string,
    password: string,
    displayName: string,
    phone?: string,
    location?: string,
    mainLivestock?: string[],
    livestockTypes?: string[]
  ) => {
    setLoading(true);
    try {
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } catch (err: any) {
        if (err?.code === 'auth/network-request-failed' || err?.message?.includes('network-request-failed')) {
          await new Promise((r) => setTimeout(r, 600));
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
        } else {
          throw err;
        }
      }

      const user = userCredential.user;

      if (displayName) {
        try {
          await fbUpdateProfile(user, { displayName });
        } catch {}
      }

      const now = new Date().toISOString();
      const resolvedLivestock = mainLivestock && mainLivestock.length > 0 ? mainLivestock : ['kuku'];
      const resolvedTypes = livestockTypes && livestockTypes.length > 0 ? livestockTypes : ['Kuku wa Kienyeji'];

      // Primary account document in Firestore: "users/{uid}"
      const profileData: UserProfile = {
        uid: user.uid,
        email: email.trim().toLowerCase(),
        role: 'farmer', // Every newly registered user starts with 'farmer' role
        displayName: displayName.trim() || 'Mfugaji',
        name: displayName.trim() || 'Mfugaji',
        phone: phone?.trim() || '',
        location: location?.trim() || '',
        region: location?.trim() || '',
        mainLivestock: resolvedLivestock,
        livestockTypes: resolvedTypes,
        farmingType: resolvedLivestock[0] || 'kuku',
        createdAt: now,
        updatedAt: now,
      };

      try {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, profileData, { merge: true });
      } catch (dbErr) {
        console.warn('Haikuweza kuhifadhi wasifu kwenye Firestore mara moja:', dbErr);
      }

      setUserProfile(profileData);
      setSellerProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (err: any) {
        if (err?.code === 'auth/network-request-failed' || err?.message?.includes('network-request-failed')) {
          await new Promise((r) => setTimeout(r, 600));
          userCredential = await signInWithEmailAndPassword(auth, email, password);
        } else {
          throw err;
        }
      }

      await fetchUserProfile(userCredential.user);
    } finally {
      setLoading(false);
    }
  };

  const loginAsAdmin = async () => {
    setLoading(true);
    try {
      const adminEmail = 'mkomwasaid53@gmail.com';
      const adminUid = 'admin_mkomwasaid53';
      const now = new Date().toISOString();
      const adminProfile: UserProfile = {
        uid: adminUid,
        email: adminEmail,
        role: 'admin',
        displayName: 'Said Mkomwa (Admin)',
        name: 'Said Mkomwa (Admin)',
        phone: '+255 700 000 000',
        location: 'Dar es Salaam',
        region: 'Dar es Salaam',
        mainLivestock: ['kuku', 'ngombe'],
        livestockTypes: ['Kuku wa Kienyeji', 'Ng\'ombe wa Maziwa'],
        farmingType: 'kuku',
        createdAt: now,
        updatedAt: now,
      };

      const mockAdminUser: any = {
        uid: adminUid,
        email: adminEmail,
        displayName: 'Said Mkomwa (Admin)',
        emailVerified: true,
        getIdToken: async () => 'admin_mock_token_' + Date.now(),
      };

      setCurrentUser(mockAdminUser);
      setUserProfile(adminProfile);
      setSellerProfile(null);

      try {
        localStorage.setItem('ufugaji_admin_session', JSON.stringify({
          user: mockAdminUser,
          profile: adminProfile,
          timestamp: Date.now()
        }));
        localStorage.setItem('ufugaji_active_uid', adminUid);
      } catch {}

      try {
        const userDocRef = doc(db, 'users', adminUid);
        await setDoc(userDocRef, adminProfile, { merge: true });
      } catch (e) {
        console.debug('Firestore sync notice for admin session:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      try {
        localStorage.removeItem('ufugaji_admin_session');
        localStorage.removeItem('ufugaji_active_uid');
      } catch {}
      try {
        await fbSignOut(auth);
      } catch {}
      setUserProfile(null);
      setSellerProfile(null);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (currentUser) {
      await fetchUserProfile(currentUser);
    }
  };

  const saveProfile = async (updatedData: Partial<UserProfile>) => {
    if (!currentUser) {
      throw new Error('Hujaingia kwenye mfumo');
    }

    const now = new Date().toISOString();
    const userDocRef = doc(db, 'users', currentUser.uid);

    // Prepare unified payload (Never overwrite role unless explicitly authorized)
    const payload: Partial<UserProfile> = {
      ...updatedData,
      uid: currentUser.uid,
      email: currentUser.email || userProfile?.email || '',
      updatedAt: now,
    };

    if (updatedData.displayName) {
      payload.name = updatedData.displayName;
    }
    if (updatedData.location) {
      payload.region = updatedData.location;
    }
    if (updatedData.mainLivestock && updatedData.mainLivestock.length > 0) {
      payload.farmingType = updatedData.mainLivestock[0];
    }

    // Save back to /users/{currentUser.uid} in Firestore
    await setDoc(userDocRef, payload, { merge: true });

    // Update Firebase Auth displayName if changed
    if (updatedData.displayName && updatedData.displayName !== currentUser.displayName) {
      try {
        await fbUpdateProfile(currentUser, { displayName: updatedData.displayName });
      } catch (e) {
        console.warn('Haikuweza kuboresha displayName katika Auth:', e);
      }
    }

    setUserProfile((prev) => (prev ? { ...prev, ...payload } as UserProfile : (payload as UserProfile)));
  };

  // Save/Activate Seller Capability without altering farmer profile or role
  const saveSellerProfileState = async (sellerData: Partial<SellerProfile>): Promise<SellerProfile> => {
    if (!currentUser) {
      throw new Error('Hujaingia kwenye mfumo');
    }

    const now = new Date().toISOString();
    const sellerDocRef = doc(db, 'users', currentUser.uid, 'sellerProfile', 'profile');

    const merged: SellerProfile = {
      uid: currentUser.uid,
      businessName: sellerData.businessName?.trim() || sellerProfile?.businessName || `${userProfile?.displayName || 'Mfugaji'} Shamba`,
      displayName: sellerData.displayName?.trim() || sellerProfile?.displayName || userProfile?.displayName || currentUser.displayName || 'Muuzaji',
      phone: sellerData.phone?.trim() || sellerProfile?.phone || userProfile?.phone || '',
      location: sellerData.location?.trim() || sellerProfile?.location || userProfile?.location || 'Dar es Salaam',
      region: sellerData.region || sellerData.location || sellerProfile?.region || userProfile?.location || 'Dar es Salaam',
      district: sellerData.district || sellerProfile?.district || '',
      description: sellerData.description?.trim() || sellerProfile?.description || '',
      verificationStatus: sellerProfile?.verificationStatus || 'unverified',
      createdAt: sellerProfile?.createdAt || now,
      updatedAt: now,
    };

    try {
      await setDoc(sellerDocRef, merged, { merge: true });
    } catch (err) {
      console.warn('Haikuweza kuhifadhi wasifu wa muuzaji kwenye Firestore moja kwa moja:', err);
    }

    try {
      localStorage.setItem(`${LOCAL_SELLER_CACHE_PREFIX}_${currentUser.uid}`, JSON.stringify(merged));
    } catch {}

    setSellerProfile(merged);
    return merged;
  };

  const updateUserRole = async (newRole: UserRole) => {
    if (!currentUser) return;
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const now = new Date().toISOString();
      await updateDoc(userDocRef, {
        role: newRole,
        updatedAt: now
      });
      setUserProfile(prev => prev ? { ...prev, role: newRole, updatedAt: now } : null);
    } catch (err) {
      console.error('Hitilafu ya kubadili cheo:', err);
      throw err;
    }
  };

  const role = userProfile?.role || (currentUser?.email === 'mkomwasaid53@gmail.com' ? 'admin' : (currentUser ? 'farmer' : null));
  const isAdmin = role === 'admin' || (currentUser?.email?.toLowerCase() === 'mkomwasaid53@gmail.com') || (userProfile?.email?.toLowerCase() === 'mkomwasaid53@gmail.com');

  // Deterministic Seller Capability Check:
  // Seller capability is active if sellerProfile exists and has a businessName/location
  const hasSellerCapability = Boolean(sellerProfile && sellerProfile.uid);
  const isSeller = hasSellerCapability || role === 'seller';

  // Farmer capability is ALWAYS ACTIVE for all users who use My Assistant or have an account
  const isFarmer = Boolean(currentUser);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        user: currentUser,
        userProfile,
        profile: userProfile,
        sellerProfile,
        role,
        loading,
        isAdmin,
        isSeller,
        isFarmer,
        hasSellerCapability,
        signup,
        login,
        loginAsAdmin,
        logout,
        refreshProfile,
        saveProfile,
        saveSellerProfileState,
        updateUserRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

