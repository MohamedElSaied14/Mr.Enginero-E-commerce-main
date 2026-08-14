/**
 * Single source of truth for the store's public identity. Changing a phone
 * number or a social link here updates the header, footer, contact page,
 * receipts and order emails at once.
 *
 * The server keeps its own copy in `server/brand.mjs` — Node cannot import a
 * TypeScript module, so the two are deliberately kept in step by hand.
 */
export const BRAND = {
  name: 'Mr.Enginero',
  /** Rendered as `Mr` + `.` + `Enginero` so the dot can be brand-coloured. */
  nameParts: { first: 'Mr', dot: '.', last: 'Enginero' },
  owner: 'Mohamed El-Saied',
  tagline: 'PC hardware & gaming gear in Egypt',
  city: 'Cairo, Egypt',
  hours: 'Sat – Thu, 10:00 – 20:00',

  phone: {
    /** As the owner writes it locally. */
    display: '0155 380 1475',
    /** E.164, for tel: and wa.me links. */
    e164: '+201553801475',
    whatsapp: '201553801475',
  },

  email: 'mediadosefp12@gmail.com',

  social: {
    facebook: 'https://www.facebook.com/profile.php?id=100064741230093',
  },

  logo: 'logo.svg',
} as const;

export const telHref = `tel:${BRAND.phone.e164}`;
export const mailHref = `mailto:${BRAND.email}`;

/** Opens WhatsApp with a message already typed. */
export function whatsappHref(message: string): string {
  return `https://wa.me/${BRAND.phone.whatsapp}?text=${encodeURIComponent(message)}`;
}
