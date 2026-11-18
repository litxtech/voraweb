/** YouTube yazarken öneri — kotasız suggest API (Data API değil). */
export async function fetchYoutubeSuggestions(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  const url =
    `https://suggestqueries.google.com/complete/search` +
    `?client=firefox&ds=yt&hl=tr&q=${encodeURIComponent(q)}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];

  return (data[1] as unknown[])
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 8);
}
