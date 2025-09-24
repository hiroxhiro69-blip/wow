addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const API_URL = 'https://uembed.xyz/api/movies' // replace with your actual endpoint

async function handleRequest(request) {
  const url = new URL(request.url)
  const tmdbId = url.searchParams.get('tmdbId') // use ?tmdbId=629542

  if (!tmdbId) {
    return new Response('Missing ?tmdbId= parameter', { status: 400 })
  }

  try {
    // Fetch list of movies from backend
    const res = await fetch(API_URL)
    const movies = await res.json()

    // Find the movie matching the TMDB ID
    const movie = movies.find(m => m.tmdbId === tmdbId)

    if (!movie || !movie.file) {
      return new Response('Movie not found or no streaming link', { status: 404 })
    }

    // Proxy the HLS file
    const hlsRes = await fetch(movie.file, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Cloudflare Worker HLS Proxy)'
      }
    })

    const body = await hlsRes.arrayBuffer()
    return new Response(body, {
      status: hlsRes.status,
      headers: {
        'Content-Type': hlsRes.headers.get('Content-Type') || 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
      }
    })
  } catch (err) {
    return new Response(err.toString(), { status: 500 })
  }
}
