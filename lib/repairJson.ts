/**
 * Attempts to close any unclosed JSON brackets/braces left by a truncated stream.
 * Returns the repaired string, or the original if it appears valid.
 */
export function repairJson(raw: string): string {
  // Strip any markdown fences
  let text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  // Extract from first { to make sure we start clean
  const start = text.indexOf("{");
  if (start === -1) return text;
  text = text.slice(start);

  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    }
  }

  if (stack.length === 0) return text; // Already valid

  // Remove trailing comma or incomplete token before closing
  let repaired = text.trimEnd().replace(/,\s*$/, "");

  // Close all open structures in reverse order
  while (stack.length > 0) {
    repaired += stack.pop() === "{" ? "}" : "]";
  }

  return repaired;
}
