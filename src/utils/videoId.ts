/**
 * Extracts the YouTube video ID from a URL string.
 * Returns null for non-watch URLs (home, shorts, playlists, etc.).
 */
export function extractVideoId(url: string): string | null {
  try {
    const { pathname, searchParams } = new URL(url)
    if (pathname !== '/watch') return null
    return searchParams.get('v') ?? null
  } catch {
    return null
  }
}
