export interface ZipEntry {
  name: string;
  text: string;
}

/**
 * Read the text entries of a ZIP in the browser, filtered by filename.
 *
 * JSZip is imported dynamically so it stays out of the main bundle — it is only
 * needed once someone actually drops a ZIP on an upload panel.
 *
 * Entries are returned separately rather than concatenated because the two callers
 * need different things: the log analyzer joins them into one stream, while the
 * status analyzer treats each file as a discrete point-in-time snapshot.
 */
export async function extractZipEntries(file: File, filterRe: RegExp): Promise<ZipEntry[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);

  const entries: ZipEntry[] = [];
  // Sorted by name so callers get a stable, usually chronological order for archives
  // named by timestamp. Callers that need true ordering re-sort on parsed content.
  const sorted = Object.entries(zip.files).sort(([a], [b]) => a.localeCompare(b));

  for (const [name, entry] of sorted) {
    if (entry.dir) continue;
    if (!filterRe.test(name)) continue;
    entries.push({ name, text: await entry.async("string") });
  }

  return entries;
}
