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
    // Fetch HLS link from uembed
    const uembedRes = await fetch(`https://uembed.site/api/videos/tmdb?id=${tmdbId}`)
    const data = await uembedRes.json()

    if (!data || data.length === 0 || !data[0].file) {
      return new Response('No streaming link found for this TMDB ID', { status: 404 })
    }

    const streamUrl = data[0].file

    // Serve HTML page with <video> tag
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${data[0].title}</title>
    </head>
    <body style="margin:0; background:black; display:flex; justify-content:center; align-items:center; height:100vh;">
      <video id="player" controls autoplay style="width:90%; max-width:1000px;">
        <source src="${streamUrl}" type="application/vnd.apple.mpegurl">
        Your browser does not support HLS.
      </video>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
      <script>
        const video = document.getElementById('player')
        if(Hls.isSupported()) {
          const hls = new Hls()
          hls.loadSource("${streamUrl}")
          hls.attachMedia(video)
        }
      </script>
    </body>
    </html>
    `

    return new Response(html, { headers: { 'Content-Type': 'text/html' } })

  } catch (err) {
    return new Response(err.toString(), { status: 500 })
  }
}
