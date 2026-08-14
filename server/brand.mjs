/**
 * Server-side copy of the store's public identity, used by the order emails.
 * Node cannot import `src/app/brand.ts`, so the two files are kept in step by
 * hand — change one, change the other.
 */
export const BRAND = {
  name: 'Mr.Enginero',
  owner: 'Mohamed El-Saied',
  city: 'Cairo, Egypt',
  hours: 'Sat – Thu, 10:00 – 20:00',
  phoneDisplay: '0155 380 1475',
  phoneE164: '+201553801475',
  whatsapp: '201553801475',
  facebook: 'https://www.facebook.com/profile.php?id=100064741230093',
};
