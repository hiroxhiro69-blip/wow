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
    // Fetch JSON from uEmbed API
    const apiRes = await fetch(`https://uembed.site/api/videos/tmdb?id=${tmdbId}`)
    const json = await apiRes.json()

    if (!json || !json.length || !json[0].file) {
      return new Response('No streaming link found for this TMDB ID', { status: 404 })
    }

    const hlsLink = json[0].file

    // Serve a simple HTML5 player that plays the HLS stream
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${json[0].title}</title>
        <style>
          body { margin: 0; background: black; display: flex; justify-content: center; align-items: center; height: 100vh; }
          video { width: 100%; height: 100%; max-width: 100%; max-height: 100%; background: black; }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
      </head>
      <body>
        <video id="video" controls autoplay></video>
        <script>
          const video = document.getElementById('video')
          const hlsLink = "${hlsLink}"
          if (Hls.isSupported()) {
            const hls = new Hls()
            hls.loadSource(hlsLink)
            hls.attachMedia(video)
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = hlsLink
          }
        </script>
      </body>
      </html>
    `

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    return new Response(err.toString(), { status: 500 })
  }
}
