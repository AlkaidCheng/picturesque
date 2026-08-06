export type ExportFormat = "png" | "jpeg" | "gif";

export interface ExportSizeOption {
  value: string;
  label: string;
}

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
