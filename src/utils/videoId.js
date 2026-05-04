/**
 * Extracts the YouTube video ID from a URL string.
 * Returns null for non-watch URLs (home, shorts, playlists, etc.).
 *
 * @param {string} url
 * @returns {string|null}
 */
export function extractVideoId(url) {
  try {
    const { pathname, searchParams } = new URL(url)
    if (pathname !== '/watch') return null
    return searchParams.get('v') ?? null
  } catch {
    return null
  }
}
