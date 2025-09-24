addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const tmdbId = url.searchParams.get('tmdb') // ?tmdb=ID

  if (!tmdbId) return new Response('Missing ?tmdb= parameter', { status: 400 })

  try {
    const res = await fetch(`https://uembed.site/api/videos/tmdb?id=${tmdbId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://uembed.site/',
        'Origin': 'https://uembed.site'
      }
    })

    const contentType = res.headers.get('Content-Type') || ''
    if (!contentType.includes('application/json')) {
      const text = await res.text()
      return new Response('Unexpected response: ' + text.slice(0, 200), { status: 500 })
    }

    const data = await res.json()
    if (!data || !data.file) return new Response('No streaming link found for this TMDB ID', { status: 404 })

    return new Response(JSON.stringify({
      title: data.title,
      thumbnail: data.thumbnail,
      hls: data.file
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (err) {
    return new Response('Error fetching streaming link: ' + err.toString(), { status: 500 })
  }
}
