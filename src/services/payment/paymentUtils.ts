/**
 * V1.8E — Payment Utilities & Tanzanian Phone Normalization
 *
 * Provides safe phone number validation & normalization for Tanzanian mobile money
 * providers (M-Pesa, TigoPesa, AirtelMoney, Halopesa) connected via PlusPesa Collections.
 * Also generates unique internal externalId references adhering to strict schema: UFU-PAY-<id>.
 */

export type SupportedPlusPesaProvider = 'Mpesa' | 'Tigo' | 'Airtel' | 'Halopesa' | 'Azampesa';

export const SUPPORTED_PLUSPESA_PROVIDERS: readonly SupportedPlusPesaProvider[] = [
  'Mpesa',
  'Tigo',
  'Airtel',
  'Halopesa',
  'Azampesa'
] as const;

export interface PhoneValidationResult {
  isValid: boolean;
  normalizedPhone?: string; // Standard format sent to PlusPesa Collections (e.g. 2557XXXXXXXX)
  nationalFormat?: string;   // Clean national format for display (e.g. 07XXXXXXXX)
  operator?: string;         // Display operator (Vodacom M-Pesa, Tigo Pesa, etc.)
  suggestedProvider?: SupportedPlusPesaProvider; // Mpesa | Tigo | Airtel | Halopesa | Azampesa
  error?: string;
}

/**
 * Normalizes Tanzanian mobile numbers.
 * Supported input formats:
 * - 07XXXXXXXX or 06XXXXXXXX (10 digits)
 * - 2557XXXXXXXX or 2556XXXXXXXX (12 digits)
 * - +2557XXXXXXXX or +2556XXXXXXXX (13 chars)
 * - Number with spaces or hyphens e.g. "0712 345 678" or "255-712-345-678"
 */
export function normalizeTanzanianPhoneNumber(rawPhone: string): PhoneValidationResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      isValid: false,
      error: 'Tafadhali weka namba ya simu ya Tanzania (Phone number is required).'
    };
  }

  // Remove any whitespace, plus signs, dashes, parentheses, or dots
  const cleaned = rawPhone.replace(/[\s\-\+\.\(\)]/g, '');

  // Must be strictly numeric
  if (!/^\d+$/.test(cleaned)) {
    return {
      isValid: false,
      error: 'Namba ya simu lazima iwe na tarakimu pekee (Phone number must contain digits only).'
    };
  }

  let msisdn = cleaned;

  // Convert national format (07... or 06...) to international format (2557... or 2556...)
  if (msisdn.startsWith('0') && msisdn.length === 10) {
    msisdn = '255' + msisdn.substring(1);
  } else if (msisdn.startsWith('255') && msisdn.length === 12) {
    // Already in 255 format
  } else {
    return {
      isValid: false,
      error: 'Namba ya simu si sahihi. Namba lazima ianze na 07, 06, au 255 (Invalid Tanzanian phone number format).'
    };
  }

  // Verify 12-digit Tanzanian MSISDN format: 255[67]XXXXXXXX
  if (!/^255[67]\d{8}$/.test(msisdn)) {
    return {
      isValid: false,
      error: 'Namba ya simu lazima iwe namba ya Tanzania ya mtandao unaofanya kazi (Valid prefixes: 07X, 06X).'
    };
  }

  const prefix2 = msisdn.substring(3, 5); // Digits after '255'
  let operator = 'Mtandao wa Tanzania';
  let suggestedProvider: SupportedPlusPesaProvider | undefined;

  if (['74', '75', '76'].includes(prefix2)) {
    operator = 'Vodacom M-Pesa';
    suggestedProvider = 'Mpesa';
  } else if (['71', '65', '67'].includes(prefix2)) {
    operator = 'Tigo Pesa';
    suggestedProvider = 'Tigo';
  } else if (['78', '68', '69'].includes(prefix2)) {
    operator = 'Airtel Money';
    suggestedProvider = 'Airtel';
  } else if (['62', '61'].includes(prefix2)) {
    operator = 'Halopesa';
    suggestedProvider = 'Halopesa';
  } else if (['73'].includes(prefix2)) {
    operator = 'Azam Pesa';
    suggestedProvider = 'Azampesa';
  } else if (['77'].includes(prefix2)) {
    operator = 'Zantel / Tigo';
    suggestedProvider = 'Tigo';
  }

  const nationalFormat = '0' + msisdn.substring(3);

  return {
    isValid: true,
    normalizedPhone: msisdn, // 255XXXXXXXXX format standard for collection accounts
    nationalFormat,          // 07XXXXXXXX format for farmer UI display
    operator,
    suggestedProvider
  };
}

/**
 * Validates and resolves the supported PlusPesa mobile provider.
 * Enforces strict allowable set: Mpesa, Tigo, Airtel, Halopesa, Azampesa.
 */
export function resolvePlusPesaProvider(
  phone: string,
  explicitProvider?: string
): {
  isValid: boolean;
  provider: SupportedPlusPesaProvider | null;
  error?: string;
} {
  // If explicitly selected, validate against the strict list (case-insensitive check with canonical casing)
  if (explicitProvider && typeof explicitProvider === 'string' && explicitProvider.trim().length > 0) {
    const trimmed = explicitProvider.trim();
    const matched = SUPPORTED_PLUSPESA_PROVIDERS.find(
      (p) => p.toLowerCase() === trimmed.toLowerCase()
    );
    if (matched) {
      return { isValid: true, provider: matched };
    }
    return {
      isValid: false,
      provider: null,
      error: `Mtandao wa malipo '${explicitProvider}' hautambuliwi. Chagua mmoja wa: ${SUPPORTED_PLUSPESA_PROVIDERS.join(', ')}.`
    };
  }

  // Derive deterministically from phone number
  const phoneValidation = normalizeTanzanianPhoneNumber(phone);
  if (!phoneValidation.isValid) {
    return {
      isValid: false,
      provider: null,
      error: phoneValidation.error || 'Namba ya simu si sahihi.'
    };
  }

  if (phoneValidation.suggestedProvider) {
    return {
      isValid: true,
      provider: phoneValidation.suggestedProvider
    };
  }

  return {
    isValid: false,
    provider: null,
    error: `Tafadhali chagua mtandao wa simu (${SUPPORTED_PLUSPESA_PROVIDERS.join(', ')}) kukamilisha malipo.`
  };
}

/**
 * Generates an internal unique external ID for PlusPesa transactions.
 * Format: UFUGAJI_PREMIUM_<paymentIdOrUniqueSuffix>
 * Allows webhook and polling flow to resolve internal payment deterministically.
 */
export function generatePaymentExternalId(paymentId?: string): string {
  if (paymentId) {
    const cleanId = paymentId.replace(/^pay_/, '');
    return `UFUGAJI_PREMIUM_${cleanId}`;
  }
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `UFUGAJI_PREMIUM_${timestamp}_${randomSuffix}`;
}

/**
 * Generates an internal unique external ID for Seller Monetization transactions (V1.10B).
 * Format: UFUGAJI_SELLER_PREMIUM_<unique-payment-reference>
 * Strictly isolates seller monetization transactions from AI Premium transactions.
 */
export function generateSellerPaymentExternalId(paymentIntentIdOrSuffix?: string): string {
  if (paymentIntentIdOrSuffix) {
    const cleanId = paymentIntentIdOrSuffix.replace(/^(spi_|pay_)/, '');
    return `UFUGAJI_SELLER_PREMIUM_${cleanId}`;
  }
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `UFUGAJI_SELLER_PREMIUM_${timestamp}_${randomSuffix}`;
}

