addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const tmdbId = url.searchParams.get('tmdb') // expect ?tmdb=ID

  if (!tmdbId) {
    return new Response('Missing ?tmdb= parameter', { status: 400 })
  }

  try {
    // Fetch the HLS info from uembed
    const res = await fetch(`https://uembed.site/api/videos/tmdb?id=${tmdbId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Cloudflare Worker HLS Proxy)'
      }
    })

    const data = await res.json() // parse JSON
    if (!data || !data.file) {
      return new Response('No streaming link found for this TMDB ID', { status: 404 })
    }

    // Return the HLS link
    return new Response(JSON.stringify({
      title: data.title,
      thumbnail: data.thumbnail,
      hls: data.file
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      }
    })
  } catch (err) {
    return new Response('Error fetching streaming link: ' + err.toString(), { status: 500 })
  }
}
