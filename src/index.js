addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const tmdbId = url.searchParams.get('tmdb')

  if (!tmdbId) {
    return new Response('Missing ?tmdb= parameter', { status: 400 })
  }

  try {
    // Fetch metadata from uembed
    const uembedRes = await fetch(`https://uembed.site/api/videos/tmdb?id=${tmdbId}`)
    const data = await uembedRes.json()

    if (!data || data.length === 0 || !data[0].file) {
      return new Response('No streaming link found for this TMDB ID', { status: 404 })
    }

    const streamUrl = data[0].file

    // If ?player=1 is provided, serve HTML player
    if (url.searchParams.get('player') === '1') {
      const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${data[0].title}</title>
      </head>
      <body style="margin:0; background:black; display:flex; justify-content:center; align-items:center; height:100vh;">
        <video controls autoplay style="width:90%; max-width:1000px;">
          <source src="${streamUrl}" type="application/vnd.apple.mpegurl">
          Your browser does not support HLS.
        </video>
      </body>
      </html>`
      return new Response(html, { headers: { 'Content-Type': 'text/html' } })
    }

    // Otherwise, return raw HLS stream
    const res = await fetch(streamUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Cloudflare Worker HLS Proxy)' }
    })

    const body = await res.arrayBuffer()
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
      }
    })

  } catch (err) {
    return new Response(err.toString(), { status: 500 })
  }
}
