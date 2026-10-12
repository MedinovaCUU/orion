// Alliance No.2 (licencia web de Biosystems), servida desde el despliegue de Orion en GitHub Pages.
// Apple Mail e iOS Mail la cargan; Gmail y Outlook de escritorio ignoran @font-face y usan el respaldo.
const FONT_BASE = 'https://medinovacuu.github.io/orion/fonts/alliance/';

const FACES: Array<[weight: string, file: string]> = [
  ['400', 'Regular'],
  ['500', 'Medium'],
  ['600 900', 'SemiBold'],
];

export const EMAIL_FONT_STACK = "'Alliance No.2','Helvetica Neue',Helvetica,Arial,sans-serif";

export const EMAIL_FONT_FACES = `<style>${FACES.map(
  ([weight, file]) =>
    `@font-face{font-family:'Alliance No.2';font-style:normal;font-weight:${weight};src:url('${FONT_BASE}AllianceNo2-${file}.woff2') format('woff2');}`,
).join('')}</style>`;
