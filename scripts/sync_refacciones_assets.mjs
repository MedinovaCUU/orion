import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(repoRoot, 'imagenes_refacciones');
const publicDir = path.join(repoRoot, 'frontend', 'public', 'refacciones_catalogo_imagenes');
const manifestFile = path.join(repoRoot, 'frontend', 'src', 'data', 'refaccionesImageManifest.ts');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const emptyDir = (dir) => {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const entry of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    const stats = fs.statSync(entryPath);
    if (stats.isDirectory()) {
      fs.rmSync(entryPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(entryPath);
    }
  }
};

const cleanVariantSuffix = (value) => value.replace(/_(\d+)$/i, '').trim();

const normalizeSpaces = (value) => value.replace(/\s+/g, ' ').trim();

const escapeTs = (value) => value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");

const buildPublicUrl = (fileName) =>
  `refacciones_catalogo_imagenes/${fileName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

const parseImageFile = (fileName) => {
  const extension = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, extension);
  const [rawCode = baseName, ...descriptionParts] = baseName.split(' - ');
  const code = normalizeSpaces(rawCode);
  const descriptionSource = descriptionParts.length > 0 ? descriptionParts.join(' - ') : rawCode;
  const description = normalizeSpaces(cleanVariantSuffix(descriptionSource));
  const variantMatch = baseName.match(/_(\d+)$/i);
  const variant = variantMatch ? Number(variantMatch[1]) : 1;

  return {
    fileName,
    extension,
    code,
    description,
    variant,
    url: buildPublicUrl(fileName),
  };
};

const main = () => {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`No existe la carpeta de origen: ${sourceDir}`);
  }

  ensureDir(publicDir);
  ensureDir(path.dirname(manifestFile));
  emptyDir(publicDir);

  const files = fs
    .readdirSync(sourceDir)
    .filter((fileName) => IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));

  const manifest = new Map();

  for (const fileName of files) {
    const sourcePath = path.join(sourceDir, fileName);
    const targetPath = path.join(publicDir, fileName);
    fs.copyFileSync(sourcePath, targetPath);

    const parsed = parseImageFile(fileName);
    const current = manifest.get(parsed.code) ?? {
      code: parsed.code,
      inferredDescription: parsed.description,
      variants: [],
    };

    current.variants.push({
      fileName: parsed.fileName,
      url: parsed.url,
      label: parsed.description,
      variant: parsed.variant,
    });

    if (!current.inferredDescription || current.inferredDescription.startsWith(parsed.code)) {
      current.inferredDescription = parsed.description;
    }

    manifest.set(parsed.code, current);
  }

  const manifestEntries = Array.from(manifest.values()).map((entry) => {
    entry.variants.sort((left, right) => left.variant - right.variant || left.fileName.localeCompare(right.fileName, 'es'));
    return entry;
  });

  const content = `/* eslint-disable */
// Archivo generado automaticamente por scripts/sync_refacciones_assets.mjs
// No editar manualmente.

export interface RefaccionImageVariant {
  fileName: string;
  url: string;
  label: string;
  variant: number;
}

export interface RefaccionImageEntry {
  code: string;
  inferredDescription: string;
  variants: RefaccionImageVariant[];
}

export const refaccionesImageEntries: RefaccionImageEntry[] = [
${manifestEntries
  .map(
    (entry) => `  {
    code: '${escapeTs(entry.code)}',
    inferredDescription: '${escapeTs(entry.inferredDescription)}',
    variants: [
${entry.variants
  .map(
    (variant) => `      {
        fileName: '${escapeTs(variant.fileName)}',
        url: '${escapeTs(variant.url)}',
        label: '${escapeTs(variant.label)}',
        variant: ${variant.variant},
      },`,
  )
  .join('\n')}
    ],
  },`,
  )
  .join('\n')}
];

export const refaccionesImageManifest: Record<string, RefaccionImageEntry> = Object.fromEntries(
  refaccionesImageEntries.map((entry) => [entry.code, entry]),
);
`;

  fs.writeFileSync(manifestFile, content, 'utf8');

  console.log(
    `Sincronizadas ${files.length} imagenes de refacciones y generado manifiesto con ${manifestEntries.length} codigos.`,
  );
};

main();
