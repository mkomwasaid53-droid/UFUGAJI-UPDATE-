import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  ProfessionalProfile,
  ProfessionalCredentials,
  DoctorFilterOptions,
  VerificationStatus,
  RegistrationStatus
} from '../types/daktari';

const PROFESSIONALS_COLLECTION = 'professionals';

export const daktariService = {
  /**
   * Fetch all registered professionals from Firestore and apply robust client-side filters & ranking
   */
  async getDoctors(filters?: DoctorFilterOptions): Promise<ProfessionalProfile[]> {
    try {
      const colRef = collection(db, PROFESSIONALS_COLLECTION);
      const snapshot = await getDocs(colRef);
      const list: ProfessionalProfile[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as ProfessionalProfile;
        // Only show active/registered/submitted/verified professionals in public directory (exclude suspended)
        if (data && data.registrationStatus !== 'suspended') {
          list.push({
            ...data,
            uid: data.uid || docSnap.id
          });
        }
      });

      // If professionals collection is empty, check users collection for backwards-compatible subcollections
      if (list.length === 0) {
        try {
          const usersCol = collection(db, 'users');
          const usersSnap = await getDocs(usersCol);
          for (const uDoc of usersSnap.docs) {
            try {
              const pRef = doc(db, 'users', uDoc.id, 'professionalProfile', 'profile');
              const pSnap = await getDoc(pRef);
              if (pSnap.exists()) {
                const pData = pSnap.data() as ProfessionalProfile;
                if (pData && pData.registrationStatus !== 'suspended') {
                  list.push({ ...pData, uid: pData.uid || uDoc.id });
                }
              }
            } catch {}
          }
        } catch {}
      }

      // Filter
      let filtered = list;

      if (filters) {
        const queryLower = filters.query?.trim().toLowerCase() || '';

        filtered = filtered.filter((doc) => {
          // Query search across name, title, location, specialties, services
          if (queryLower) {
            const matchesName = (doc.fullName || '').toLowerCase().includes(queryLower);
            const matchesTitle = (doc.professionalTitle || '').toLowerCase().includes(queryLower);
            const matchesRegion = (doc.region || '').toLowerCase().includes(queryLower);
            const matchesDistrict = (doc.district || '').toLowerCase().includes(queryLower);
            const matchesArea = (doc.wardOrArea || '').toLowerCase().includes(queryLower);
            const matchesSpecialty = (doc.livestockSpecialties || []).some((s) =>
              s.toLowerCase().includes(queryLower)
            );
            const matchesService = (doc.services || []).some((s) =>
              s.toLowerCase().includes(queryLower)
            );

            if (
              !matchesName &&
              !matchesTitle &&
              !matchesRegion &&
              !matchesDistrict &&
              !matchesArea &&
              !matchesSpecialty &&
              !matchesService
            ) {
              return false;
            }
          }

          // Specific region filter
          if (filters.region && filters.region !== 'all') {
            if ((doc.region || '').toLowerCase() !== filters.region.toLowerCase()) {
              return false;
            }
          }

          // Specific district filter
          if (filters.district && filters.district !== 'all') {
            if ((doc.district || '').toLowerCase() !== filters.district.toLowerCase()) {
              return false;
            }
          }

          // Livestock specialty filter
          if (filters.livestockType && filters.livestockType !== 'all') {
            const specLower = filters.livestockType.toLowerCase();
            const hasSpec = (doc.livestockSpecialties || []).some(
              (s) => s.toLowerCase().includes(specLower) || specLower.includes(s.toLowerCase())
            );
            if (!hasSpec) return false;
          }

          // Service filter
          if (filters.service && filters.service !== 'all') {
            const srvLower = filters.service.toLowerCase();
            const hasSrv = (doc.services || []).some(
              (s) => s.toLowerCase().includes(srvLower) || srvLower.includes(s.toLowerCase())
            );
            if (!hasSrv) return false;
          }

          // Emergency only filter
          if (filters.emergencyOnly) {
            if (!doc.emergencyAvailable) return false;
          }

          // Verified only filter
          if (filters.verifiedOnly) {
            if (doc.verificationStatus !== 'verified') return false;
          }

          return true;
        });
      }

      // Ranking criteria:
      // 1. Verified professionals first (verificationStatus === 'verified')
      // 2. Emergency available
      // 3. Alphabetical / Recency
      filtered.sort((a, b) => {
        const aVerified = a.verificationStatus === 'verified' ? 1 : 0;
        const bVerified = b.verificationStatus === 'verified' ? 1 : 0;
        if (bVerified !== aVerified) return bVerified - aVerified;

        const aEmergency = a.emergencyAvailable ? 1 : 0;
        const bEmergency = b.emergencyAvailable ? 1 : 0;
        if (bEmergency !== aEmergency) return bEmergency - aEmergency;

        return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
      });

      return filtered;
    } catch (err) {
      console.error('Hitilafu ya kupata orodha ya madaktari:', err);
      return [];
    }
  },

  /**
   * Fetch a single doctor's public profile by UID
   */
  async getDoctorById(uid: string): Promise<ProfessionalProfile | null> {
    if (!uid) return null;
    try {
      // 1. Try public professionals collection
      const docRef = doc(db, PROFESSIONALS_COLLECTION, uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as ProfessionalProfile;
      }

      // 2. Fallback to /users/{uid}/professionalProfile/profile
      const userPRef = doc(db, 'users', uid, 'professionalProfile', 'profile');
      const userPSnap = await getDoc(userPRef);
      if (userPSnap.exists()) {
        return userPSnap.data() as ProfessionalProfile;
      }
      return null;
    } catch (err) {
      console.error('Hitilafu ya kupata wasifu wa daktari:', err);
      return null;
    }
  },

  /**
   * Fetch a professional's private credentials (authorized to owner or admin only)
   */
  async getDoctorCredentials(uid: string): Promise<ProfessionalCredentials | null> {
    if (!uid) return null;
    try {
      const credRef = doc(db, 'users', uid, 'professionalProfile', 'credentials');
      const snap = await getDoc(credRef);
      if (snap.exists()) {
        return snap.data() as ProfessionalCredentials;
      }
      return null;
    } catch (err) {
      console.warn('Haikuweza kusoma vyeti (huenda hauna idhini au bado havijawekwa):', err);
      return null;
    }
  },

  /**
   * Fetch user's own profile and credentials for onboarding / management
   */
  async getUserProfessionalData(uid: string): Promise<{
    profile: ProfessionalProfile | null;
    credentials: ProfessionalCredentials | null;
  }> {
    if (!uid) return { profile: null, credentials: null };

    const [profile, credentials] = await Promise.all([
      this.getDoctorById(uid),
      this.getDoctorCredentials(uid)
    ]);

    return { profile, credentials };
  },

  /**
   * Save / Update user's professional profile and credentials.
   * Maintains dual write to /users/{uid}/professionalProfile/profile and /professionals/{uid}
   */
  async saveProfessionalProfile(
    uid: string,
    profileData: Partial<ProfessionalProfile>,
    credentialsData?: Partial<ProfessionalCredentials>
  ): Promise<ProfessionalProfile> {
    if (!uid) throw new Error('Kitambulisho cha mtumiaji (UID) kinahitajika.');

    const now = new Date().toISOString();
    const existing = await this.getDoctorById(uid);

    // Default trial ends 30 days from now
    const defaultTrialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const mergedProfile: ProfessionalProfile = {
      uid,
      fullName: profileData.fullName?.trim() || existing?.fullName || '',
      professionalTitle: profileData.professionalTitle?.trim() || existing?.professionalTitle || 'Daktari wa Mifugo',
      professionalType: profileData.professionalType || existing?.professionalType || 'Veterinarian',
      phone: profileData.phone?.trim() || existing?.phone || '',
      whatsapp: profileData.whatsapp?.trim() || existing?.whatsapp || profileData.phone?.trim() || existing?.phone || '',
      region: profileData.region?.trim() || existing?.region || 'Morogoro',
      district: profileData.district?.trim() || existing?.district || '',
      wardOrArea: profileData.wardOrArea?.trim() || existing?.wardOrArea || '',
      locationDescription: profileData.locationDescription?.trim() || existing?.locationDescription || '',
      livestockSpecialties: profileData.livestockSpecialties || existing?.livestockSpecialties || ['Kuku'],
      services: profileData.services || existing?.services || ['Ziara ya Shamba', 'Ushauri wa Afya'],
      availability: profileData.availability || existing?.availability || 'available_today',
      emergencyAvailable: profileData.emergencyAvailable !== undefined ? profileData.emergencyAvailable : (existing?.emergencyAvailable ?? true),
      bio: profileData.bio?.trim() || existing?.bio || '',
      profileImage: profileData.profileImage || existing?.profileImage || '',

      // Status preservation (Sensitive: ordinary doctor cannot verify themselves)
      registrationStatus: profileData.registrationStatus || existing?.registrationStatus || 'registered',
      verificationStatus: existing?.verificationStatus || 'unverified',
      verificationSubmittedAt: existing?.verificationSubmittedAt || null,
      verifiedAt: existing?.verifiedAt || null,
      adminVerificationNotes: existing?.adminVerificationNotes || null,

      // Monetization & Subscription state
      registrationFee: 5000,
      registrationPaymentStatus: existing?.registrationPaymentStatus || 'unpaid',
      subscriptionStatus: existing?.subscriptionStatus || 'free_trial',
      subscriptionStart: existing?.subscriptionStart || now,
      subscriptionEnd: existing?.subscriptionEnd || defaultTrialEnd,
      freeTrialStart: existing?.freeTrialStart || now,
      freeTrialEnd: existing?.freeTrialEnd || defaultTrialEnd,
      nextPaymentDue: existing?.nextPaymentDue || defaultTrialEnd,

      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    // 1. Write to /users/{uid}/professionalProfile/profile
    const userProfileRef = doc(db, 'users', uid, 'professionalProfile', 'profile');
    await setDoc(userProfileRef, mergedProfile, { merge: true });

    // 2. Write to public directory /professionals/{uid}
    const publicRef = doc(db, PROFESSIONALS_COLLECTION, uid);
    await setDoc(publicRef, mergedProfile, { merge: true });

    // 3. If credentials provided, write to private credentials doc
    if (credentialsData) {
      const credRef = doc(db, 'users', uid, 'professionalProfile', 'credentials');
      const existingCred = await this.getDoctorCredentials(uid);
      const mergedCred: ProfessionalCredentials = {
        uid,
        professionalRegistrationNumber: credentialsData.professionalRegistrationNumber?.trim() || existingCred?.professionalRegistrationNumber || '',
        professionalQualification: credentialsData.professionalQualification?.trim() || existingCred?.professionalQualification || '',
        institution: credentialsData.institution?.trim() || existingCred?.institution || '',
        graduationYear: credentialsData.graduationYear || existingCred?.graduationYear || '',
        documentUrls: credentialsData.documentUrls || existingCred?.documentUrls || [],
        documentNotes: credentialsData.documentNotes?.trim() || existingCred?.documentNotes || '',
        submittedAt: existingCred?.submittedAt || now,
        updatedAt: now,
      };
      await setDoc(credRef, mergedCred, { merge: true });
    }

    return mergedProfile;
  },

  /**
   * Submit profile and credentials for Admin Verification
   */
  async submitForVerification(uid: string): Promise<void> {
    if (!uid) throw new Error('Kitambulisho kinahitajika');

    const now = new Date().toISOString();
    const updatePayload = {
      registrationStatus: 'submitted' as RegistrationStatus,
      verificationStatus: 'pending' as VerificationStatus,
      verificationSubmittedAt: now,
      adminVerificationNotes: null,
      updatedAt: now,
    };

    const userProfileRef = doc(db, 'users', uid, 'professionalProfile', 'profile');
    const publicRef = doc(db, PROFESSIONALS_COLLECTION, uid);

    await Promise.all([
      setDoc(userProfileRef, updatePayload, { merge: true }),
      setDoc(publicRef, updatePayload, { merge: true })
    ]);
  },

  /**
   * Admin actions: Verify, Reject, Request Correction, Suspend
   */
  async adminReviewProfile(
    uid: string,
    action: 'verify' | 'reject' | 'needs_correction' | 'suspend',
    notes?: string
  ): Promise<void> {
    if (!uid) throw new Error('Kitambulisho kinahitajika');

    const now = new Date().toISOString();
    let updatePayload: Partial<ProfessionalProfile> = {
      updatedAt: now,
      adminVerificationNotes: notes || null,
    };

    if (action === 'verify') {
      updatePayload.verificationStatus = 'verified';
      updatePayload.verifiedAt = now;
      updatePayload.registrationStatus = 'active';
    } else if (action === 'reject') {
      updatePayload.verificationStatus = 'rejected';
    } else if (action === 'needs_correction') {
      updatePayload.verificationStatus = 'needs_correction';
    } else if (action === 'suspend') {
      updatePayload.registrationStatus = 'suspended';
    }

    const userProfileRef = doc(db, 'users', uid, 'professionalProfile', 'profile');
    const publicRef = doc(db, PROFESSIONALS_COLLECTION, uid);

    await Promise.all([
      updateDoc(userProfileRef, updatePayload),
      updateDoc(publicRef, updatePayload)
    ]);
  }
};
