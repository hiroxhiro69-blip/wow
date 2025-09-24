addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const tmdbId = url.searchParams.get('tmdb') // ?tmdb=ID

  if (!tmdbId) return new Response('Missing ?tmdb= parameter', { status: 400 })

  try {
    // Fetch the embed page from uembed
    const res = await fetch(`https://uembed.site/embed/tmdb?id=${tmdbId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html',
        'Referer': 'https://uembed.site/',
      }
    })

    const html = await res.text()

    // Extract the HLS link from the embed HTML
    const match = html.match(/"file":"(https:\\/\\/cdn\.[^"]+\.m3u8)"/)
    if (!match) return new Response('No streaming link found for this TMDB ID', { status: 404 })

    const hlsUrl = match[1].replace(/\\\//g, '/')

    // Return a small HTML page with a video player
    const playerHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TMDB Video Player</title>
      </head>
      <body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#000;">
        <video id="player" controls autoplay style="width:100%;max-width:1000px;height:auto;">
          <source src="${hlsUrl}" type="application/x-mpegURL">
          Your browser does not support HLS playback.
        </video>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        <script>
          if(Hls.isSupported()) {
            const video = document.getElementById('player')
            const hls = new Hls()
            hls.loadSource('${hlsUrl}')
            hls.attachMedia(video)
          }
        </script>
      </body>
      </html>
    `

    return new Response(playerHtml, {
      headers: { 'Content-Type': 'text/html' }
    })
  } catch (err) {
    return new Response('Error fetching streaming link: ' + err.toString(), { status: 500 })
  }
}
