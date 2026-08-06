export type ExportFormat = "png" | "jpeg" | "gif";

export interface ExportSizeOption {
  value: string;
  label: string;
}

export interface ComparisonArchiveFilenameOptions {
  projectName?: string | null;
  leftCollectionName?: string | null;
  rightCollectionName?: string | null;
  comparisonMode?: string | null;
}

const ARCHIVE_SEGMENT_MAX_BYTES = 48;
const UTF8_ENCODER = new TextEncoder();

const STATIC_SIZE_OPTIONS: readonly ExportSizeOption[] = Object.freeze([
  { value: "1600", label: "1600 px" },
  { value: "2400", label: "2400 px" },
  { value: "3840", label: "3840 px" },
  { value: "original", label: "Largest source edge" }
]);

const GIF_SIZE_OPTIONS: readonly ExportSizeOption[] = Object.freeze([
  { value: "640", label: "640 px" },
  { value: "960", label: "960 px" },
  { value: "1280", label: "1280 px" },
  { value: "1600", label: "1600 px" }
]);

export function exportExtension(format: ExportFormat): string {
  if (format === "jpeg") return "jpg";
  if (format === "png" || format === "gif") return format;
  throw new TypeError(`Unsupported export format: ${String(format)}`);
}

export function exportSizeOptions(format: ExportFormat): readonly ExportSizeOption[] {
  return format === "gif" ? GIF_SIZE_OPTIONS : STATIC_SIZE_OPTIONS;
}

export function defaultExportLongEdge(format: ExportFormat): string {
  return format === "gif" ? "960" : "2400";
}

export function coerceExportLongEdge(format: ExportFormat, value: string): string {
  return exportSizeOptions(format).some((option) => option.value === value)
    ? value
    : defaultExportLongEdge(format);
}

export function canExportAnimatedGif(comparisonMode: string, hasRightCollection: boolean): boolean {
  return comparisonMode === "blink" && hasRightCollection;
}

function utf8Prefix(value: string, maximumBytes: number): string {
  let byteLength = 0;
  let result = "";
  for (const character of value) {
    const characterBytes = UTF8_ENCODER.encode(character).byteLength;
    if (byteLength + characterBytes > maximumBytes) break;
    byteLength += characterBytes;
    result += character;
  }
  return result.replace(/-+$/u, "");
}

function filenameHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const byte of UTF8_ENCODER.encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function truncateUtf8(value: string, maximumBytes: number): string {
  if (UTF8_ENCODER.encode(value).byteLength <= maximumBytes) return value;
  const suffix = `-${filenameHash(value)}`;
  const prefixBytes = maximumBytes - UTF8_ENCODER.encode(suffix).byteLength;
  return `${utf8Prefix(value, prefixBytes)}${suffix}`;
}

function normalizeArchiveFilenameSegment(
  value: string | null | undefined,
  fallback: string
): string {
  const normalized = (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFC")
    .replace(/['’]+/gu, "")
    .replace(/[^\p{Letter}\p{Number}\p{Mark}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/^\p{Mark}+/u, "");
  return truncateUtf8(normalized, ARCHIVE_SEGMENT_MAX_BYTES) || fallback;
}

export function comparisonArchiveFilename({
  projectName,
  leftCollectionName,
  rightCollectionName,
  comparisonMode
}: ComparisonArchiveFilenameOptions): string {
  const project = normalizeArchiveFilenameSegment(projectName, "project");
  const left = normalizeArchiveFilenameSegment(leftCollectionName, "set-a");
  const mode = normalizeArchiveFilenameSegment(comparisonMode, "comparison");
  const hasRightCollection = rightCollectionName !== null && rightCollectionName !== undefined;
  const collections = hasRightCollection
    ? `${left}-vs-${normalizeArchiveFilenameSegment(rightCollectionName, "set-b")}`
    : left;
  return `${project}_${collections}_${mode}.zip`;
}

export function uniqueExportFilename(filename: string, usedNames: Set<string>): string {
  const extensionIndex = filename.lastIndexOf(".");
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";
  let candidate = filename;
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase())) {
    candidate = `${stem}-${suffix}${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}
