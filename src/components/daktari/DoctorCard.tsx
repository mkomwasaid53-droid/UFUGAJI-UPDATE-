import React from 'react';
import {
  Phone,
  MessageCircle,
  ShieldCheck,
  MapPin,
  Clock,
  AlertCircle,
  ChevronRight,
  Stethoscope,
  Sparkles
} from 'lucide-react';
import { ProfessionalProfile } from '../../types/daktari';

interface DoctorCardProps {
  doctor: ProfessionalProfile;
  onViewProfile: (doctor: ProfessionalProfile) => void;
}

export const DoctorCard: React.FC<DoctorCardProps> = ({ doctor, onViewProfile }) => {
  const isVerified = doctor.verificationStatus === 'verified';

  // Format phone for dialing
  const cleanPhone = (doctor.phone || '').replace(/[^0-9+]/g, '');

  // Format whatsapp link
  const cleanWa = (doctor.whatsapp || doctor.phone || '').replace(/[^0-9]/g, '');
  const intlWa = cleanWa.startsWith('0')
    ? '255' + cleanWa.slice(1)
    : cleanWa.startsWith('255')
    ? cleanWa
    : '255' + cleanWa;

  const waGreeting = encodeURIComponent(
    `Habari ${doctor.professionalTitle || 'Daktari'} ${doctor.fullName}, nimeona wasifu wako kwenye Ufugaji Update (Daktari Mtaani Kwako). Nahitaji msaada/ushauri wa kitaalamu kuhusu mifugo yangu.`
  );

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cleanPhone) return;
    window.location.href = `tel:${cleanPhone}`;
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!intlWa) return;
    window.open(`https://wa.me/${intlWa}?text=${waGreeting}`, '_blank', 'noopener,noreferrer');
  };

  const getAvailabilityLabel = () => {
    switch (doctor.availability) {
      case 'available_today':
        return { label: 'Anapatikana Leo', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'weekdays':
        return { label: 'Jumatatu - Ijumaa', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'by_appointment':
        return { label: 'Kwa Miadi Tu', color: 'bg-stone-100 text-stone-700 border-stone-200' };
      case 'always':
        return { label: 'Muda Wote', color: 'bg-teal-50 text-teal-700 border-teal-200' };
      default:
        return { label: 'Anapatikana', color: 'bg-stone-50 text-stone-600 border-stone-200' };
    }
  };

  const availInfo = getAvailabilityLabel();

  return (
    <article
      id={`doctor-card-${doctor.uid}`}
      onClick={() => onViewProfile(doctor)}
      className="bg-white rounded-2xl border border-stone-200/90 hover:border-emerald-500/40 p-4 shadow-xs hover:shadow-md transition-all cursor-pointer space-y-3 relative group"
    >
      {/* Header: Avatar, Name, Verification badge */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-3">
          {/* Avatar / Initials */}
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200/80 flex items-center justify-center font-bold text-base shrink-0 overflow-hidden relative">
            {doctor.profileImage ? (
              <img
                src={doctor.profileImage}
                alt={doctor.fullName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>
                {doctor.fullName
                  ? doctor.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : 'DK'}
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-bold text-stone-900 group-hover:text-emerald-800 transition-colors leading-tight">
                {doctor.professionalTitle ? `${doctor.professionalTitle} ` : ''}{doctor.fullName}
              </h3>

              {/* Verified Trust Badge: ONLY if verificationStatus === 'verified' */}
              {isVerified && (
                <span
                  title="Kitambulisho kimethibitishwa na Ufugaji Update"
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white shadow-2xs shrink-0"
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>Waliothibitishwa</span>
                </span>
              )}
            </div>

            <p className="text-xs text-emerald-800 font-medium pt-0.5">
              {doctor.professionalType === 'Veterinarian'
                ? 'Daktari wa Mifugo (BVM/DVM)'
                : doctor.professionalType === 'Animal Health Professional'
                ? 'Afisa Afya ya Mifugo'
                : doctor.professionalType === 'Livestock Extension Professional'
                ? 'Afisa Ugani wa Mifugo'
                : doctor.professionalType || 'Mtaalamu wa Mifugo'}
            </p>

            {/* Location */}
            <p className="text-[11px] text-stone-500 flex items-center gap-1 pt-1">
              <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
              <span>
                {doctor.region}
                {doctor.district ? ` — ${doctor.district}` : ''}
                {doctor.wardOrArea ? ` (${doctor.wardOrArea})` : ''}
              </span>
            </p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-col items-end gap-1">
          {doctor.emergencyAvailable && (
            <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200/80 inline-flex items-center gap-1 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              Dharura 24/7
            </span>
          )}
          <span className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-full border ${availInfo.color} whitespace-nowrap`}>
            {availInfo.label}
          </span>
        </div>
      </div>

      {/* Specialties Tags */}
      {doctor.livestockSpecialties && doctor.livestockSpecialties.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wide">Mifugo anayohudumia:</p>
          <div className="flex flex-wrap gap-1">
            {doctor.livestockSpecialties.slice(0, 4).map((spec, idx) => (
              <span
                key={idx}
                className="text-[10.5px] font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/60"
              >
                {spec}
              </span>
            ))}
            {doctor.livestockSpecialties.length > 4 && (
              <span className="text-[10px] text-stone-500 self-center px-1 font-medium">
                +{doctor.livestockSpecialties.length - 4} zaidi
              </span>
            )}
          </div>
        </div>
      )}

      {/* Services summary */}
      {doctor.services && doctor.services.length > 0 && (
        <div className="text-[11px] text-stone-600 flex items-center gap-1.5 pt-0.5 truncate">
          <Stethoscope className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span className="truncate">
            Huduma: {doctor.services.slice(0, 3).join(' • ')}
            {doctor.services.length > 3 ? '...' : ''}
          </span>
        </div>
      )}

      {/* Actions: Call, WhatsApp, View Profile */}
      <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {/* Call Button */}
          {cleanPhone && (
            <button
              id={`doctor-call-btn-${doctor.uid}`}
              onClick={handleCall}
              className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs min-h-[34px]"
              title={`Piga simu kwa ${doctor.fullName}`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Piga Simu</span>
            </button>
          )}

          {/* WhatsApp Button */}
          {intlWa && (
            <button
              id={`doctor-whatsapp-btn-${doctor.uid}`}
              onClick={handleWhatsApp}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/80 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer min-h-[34px]"
              title={`Tuma ujumbe wa WhatsApp kwa ${doctor.fullName}`}
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
              <span>WhatsApp</span>
            </button>
          )}
        </div>

        {/* View Profile link */}
        <button
          id={`doctor-profile-btn-${doctor.uid}`}
          onClick={(e) => {
            e.stopPropagation();
            onViewProfile(doctor);
          }}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 p-1 rounded-lg hover:bg-stone-50 transition-colors cursor-pointer"
        >
          <span>Wasifu</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
};
