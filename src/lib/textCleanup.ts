/**
 * Removes content that reads poorly when narrated aloud but is common in
 * text extracted from web articles, PDFs, and DOCX files: citation markers,
 * "[edit]" links, and image/figure caption or credit lines.
 */
export function removeNoiseText(text: string): string {
  let result = text;

  // Inline citation/footnote markers: [1], [23], [a], [citation needed], [edit]...
  result = result.replace(
    /\[(?:\d{1,3}|[a-z]|citation needed|edit|update needed|clarification needed|when\?|who\?|by whom\?|according to whom\?|dubious[^\]]*|verification needed|further explanation needed|note \d+)\]/gi,
    ""
  );

  // Drop lines that are entirely image/figure captions or source credits.
  const captionLine = /^(figure|fig\.?|image|photo(?:graph)?|illustration|caption|credit|source|courtesy|getty images?|shutterstock|reuters|ap photo)\s*[:.\-–—]/i;

  const lines = result.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    if (captionLine.test(trimmed)) return "";
    return trimmed;
  });

  result = lines.join("\n");

  // Tidy up whitespace/punctuation left behind by removed markers.
  result = result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return result;
}
