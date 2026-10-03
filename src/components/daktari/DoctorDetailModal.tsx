import React from 'react';
import {
  X,
  Phone,
  MessageCircle,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Clock,
  CheckCircle2,
  Stethoscope,
  Info,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import { ProfessionalProfile } from '../../types/daktari';

interface DoctorDetailModalProps {
  doctor: ProfessionalProfile | null;
  onClose: () => void;
}

export const DoctorDetailModal: React.FC<DoctorDetailModalProps> = ({ doctor, onClose }) => {
  if (!doctor) return null;

  const isVerified = doctor.verificationStatus === 'verified';
  const isPending = doctor.verificationStatus === 'pending';

  const cleanPhone = (doctor.phone || '').replace(/[^0-9+]/g, '');
  const cleanWa = (doctor.whatsapp || doctor.phone || '').replace(/[^0-9]/g, '');
  const intlWa = cleanWa.startsWith('0')
    ? '255' + cleanWa.slice(1)
    : cleanWa.startsWith('255')
    ? cleanWa
    : '255' + cleanWa;

  const waGreeting = encodeURIComponent(
    `Habari ${doctor.professionalTitle || 'Daktari'} ${doctor.fullName}, nimeona wasifu wako kwenye Ufugaji Update (Daktari Mtaani Kwako). Nahitaji ushauri wa kitaalamu kuhusu mifugo yangu.`
  );

  const handleCall = () => {
    if (!cleanPhone) return;
    window.location.href = `tel:${cleanPhone}`;
  };

  const handleWhatsApp = () => {
    if (!intlWa) return;
    window.open(`https://wa.me/${intlWa}?text=${waGreeting}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        className="bg-white w-full max-w-lg max-h-[92vh] sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col shadow-2xl border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Modal Header */}
        <div className="px-5 py-4 border-b border-stone-200/80 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center">
              <Stethoscope className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900">Wasifu wa Mtaalamu</h2>
              <p className="text-[11px] text-stone-500">Daktari Mtaani Kwako</p>
            </div>
          </div>
          <button
            id="doctor-detail-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-stone-800">
          {/* Doctor Header Profile */}
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 border-2 border-emerald-300 flex items-center justify-center font-bold text-xl shrink-0 overflow-hidden shadow-xs">
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

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-stone-900 leading-tight">
                  {doctor.professionalTitle ? `${doctor.professionalTitle} ` : ''}{doctor.fullName}
                </h3>
              </div>

              <p className="text-xs font-semibold text-emerald-800">
                {doctor.professionalType === 'Veterinarian'
                  ? 'Daktari wa Mifugo (BVM / DVM)'
                  : doctor.professionalType === 'Animal Health Professional'
                  ? 'Afisa Afya ya Mifugo'
                  : doctor.professionalType === 'Livestock Extension Professional'
                  ? 'Afisa Ugani wa Mifugo'
                  : doctor.professionalType || 'Mtaalamu wa Mifugo'}
              </p>

              <p className="text-xs text-stone-500 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>
                  {doctor.region}
                  {doctor.district ? ` — ${doctor.district}` : ''}
                  {doctor.wardOrArea ? ` (${doctor.wardOrArea})` : ''}
                </span>
              </p>
            </div>
          </div>

          {/* Verification Status Explanation Banner */}
          {isVerified ? (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-emerald-900">
                  Mtaalamu Aliyethibitishwa
                </p>
                <p className="text-[11.5px] text-emerald-800 leading-relaxed">
                  Kitambulisho cha kitaalamu kimethibitishwa na Ufugaji Update. Vyeti na sifa za kitaalamu zimekaguliwa na kuidhinishwa.
                </p>
                {doctor.verifiedAt && (
                  <p className="text-[10px] text-emerald-600 pt-0.5">
                    Tarehe ya uhakiki: {new Date(doctor.verifiedAt).toLocaleDateString('sw-TZ')}
                  </p>
                )}
              </div>
            </div>
          ) : isPending ? (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-900">Uhakiki Unasubiriwa</p>
                <p className="text-[11.5px] text-amber-800 leading-relaxed">
                  Ombi la uhakiki wa vyeti vya daktari huyu lipo katika hatua za mapitio na wasimamizi wa jukwaa.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Mtaalamu huyu amejisajili lakini bado hajahakikiwa rasmi na jukwaa. Hakikisha unathibitisha vitambulisho kabla ya kutoa fedha au matibabu nyeti.
              </p>
            </div>
          )}

          {/* Quick Contact Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              id="doctor-detail-call-btn"
              onClick={handleCall}
              disabled={!cleanPhone}
              className="py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer min-h-[44px]"
            >
              <Phone className="w-4 h-4" />
              <span>Piga Simu ({doctor.phone})</span>
            </button>

            <button
              id="doctor-detail-whatsapp-btn"
              onClick={handleWhatsApp}
              disabled={!intlWa}
              className="py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 disabled:bg-stone-100 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px]"
            >
              <MessageCircle className="w-4 h-4 text-emerald-700" />
              <span>Tuma WhatsApp</span>
            </button>
          </div>

          {/* Availability & Emergency Information */}
          <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 font-medium">Upatikanaji wa Kazi:</span>
              <span className="font-bold text-stone-900">
                {doctor.availability === 'available_today'
                  ? 'Anapatikana Leo'
                  : doctor.availability === 'weekdays'
                  ? 'Jumatatu hadi Ijumaa'
                  : doctor.availability === 'by_appointment'
                  ? 'Kwa Miadi Tu'
                  : 'Muda Wote'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200/60">
              <span className="text-stone-500 font-medium">Huduma ya Dharura (24/7):</span>
              <span className={`font-bold inline-flex items-center gap-1 ${
                doctor.emergencyAvailable ? 'text-red-700' : 'text-stone-500'
              }`}>
                {doctor.emergencyAvailable ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    Inapatikana
                  </>
                ) : (
                  'Haipatikani'
                )}
              </span>
            </div>

            {doctor.locationDescription && (
              <div className="text-xs pt-1 border-t border-stone-200/60 space-y-0.5">
                <span className="text-stone-500 font-medium">Maelezo ya Eneo / Kituo:</span>
                <p className="text-stone-700 text-[11.5px] leading-relaxed">
                  {doctor.locationDescription}
                </p>
              </div>
            )}
          </div>

          {/* Livestock Specialties */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
              Aina za Mifugo Anayohudumia
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {doctor.livestockSpecialties && doctor.livestockSpecialties.length > 0 ? (
                doctor.livestockSpecialties.map((spec, idx) => (
                  <span
                    key={idx}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                  >
                    {spec}
                  </span>
                ))
              ) : (
                <span className="text-xs text-stone-500">Mifugo ya jumla</span>
              )}
            </div>
          </div>

          {/* Services Provided */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
              Huduma Zinazotolewa
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {doctor.services && doctor.services.length > 0 ? (
                doctor.services.map((service, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 rounded-xl bg-stone-50 border border-stone-200/70 text-xs text-stone-800"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="font-medium">{service}</span>
                  </div>
                ))
              ) : (
                <span className="text-xs text-stone-500">Ushauri wa jumla</span>
              )}
            </div>
          </div>

          {/* Professional Bio */}
          {doctor.bio && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                Kuhusu Mtaalamu & Uzoefu
              </h4>
              <p className="text-xs text-stone-700 leading-relaxed bg-stone-50 p-3 rounded-xl border border-stone-200/70 whitespace-pre-line">
                {doctor.bio}
              </p>
            </div>
          )}

          {/* Platform Positioning Footer Note */}
          <div className="p-3 bg-stone-100 rounded-xl border border-stone-200 text-center space-y-1">
            <p className="text-[11px] font-bold text-emerald-900">
              "AI inakusaidia kuelewa. Daktari anakusaidia kufanya uamuzi wa kitaalamu."
            </p>
            <p className="text-[10px] text-stone-500 leading-tight">
              Ufugaji Update inakuunganisha na wataalamu huru wa mifugo. Makubaliano na gharama za ziara hufanyika moja kwa moja kati yako na daktari.
            </p>
          </div>
        </div>

        {/* Sticky Close Button */}
        <div className="p-4 border-t border-stone-200/80 bg-stone-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold transition-colors cursor-pointer min-h-[38px]"
          >
            Funga
          </button>
        </div>
      </div>
    </div>
  );
};
