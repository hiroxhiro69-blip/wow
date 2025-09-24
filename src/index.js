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
    const title = json[0].title
    const thumbnail = json[0].thumbnail

    // HTML page with Netflix-like player
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body {
            margin: 0;
            background: #141414;
            color: #fff;
            font-family: 'Roboto', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          #player-container {
            position: relative;
            width: 90%;
            max-width: 1280px;
            aspect-ratio: 16/9;
          }
          video {
            width: 100%;
            height: 100%;
            background: black;
            border-radius: 10px;
          }
          #controls {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            background: rgba(0,0,0,0.4);
            border-radius: 0 0 10px 10px;
            opacity: 0;
            transition: opacity 0.3s;
          }
          #player-container:hover #controls {
            opacity: 1;
          }
          .btn {
            cursor: pointer;
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            margin: 0 5px;
          }
          select {
            background: #222;
            color: #fff;
            border: none;
            padding: 5px;
            border-radius: 5px;
          }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
      </head>
      <body>
        <div id="player-container">
          <video id="video" poster="${thumbnail}" controls autoplay></video>
          <div id="controls">
            <button class="btn" id="playpause">⏯</button>
            <label for="audioSelect">Audio: </label>
            <select id="audioSelect"></select>
            <label for="subtitleSelect">Subtitles: </label>
            <select id="subtitleSelect">
              <option value="off">Off</option>
            </select>
          </div>
        </div>
        <script>
          const video = document.getElementById('video')
          const playpause = document.getElementById('playpause')
          const audioSelect = document.getElementById('audioSelect')
          const subtitleSelect = document.getElementById('subtitleSelect')
          const hlsLink = "${hlsLink}"

          function setupPlayer() {
            if (Hls.isSupported()) {
              const hls = new Hls()
              hls.loadSource(hlsLink)
              hls.attachMedia(video)

              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                // Populate audio tracks
                hls.audioTracks.forEach((track, index) => {
                  const option = document.createElement('option')
                  option.value = index
                  option.text = track.name || 'Audio ' + (index + 1)
                  audioSelect.appendChild(option)
                })

                // Populate subtitle tracks
                if (hls.subtitleTracks.length > 0) {
                  hls.subtitleTracks.forEach((track, index) => {
                    const option = document.createElement('option')
                    option.value = index
                    option.text = track.name || 'Subtitle ' + (index + 1)
                    subtitleSelect.appendChild(option)
                  })
                }
              })

              audioSelect.addEventListener('change', () => {
                hls.audioTrack = parseInt(audioSelect.value)
              })

              subtitleSelect.addEventListener('change', () => {
                const val = subtitleSelect.value
                hls.subtitleTrack = val === 'off' ? -1 : parseInt(val)
              })
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = hlsLink
            }
          }

          setupPlayer()

          playpause.addEventListener('click', () => {
            if(video.paused) video.play()
            else video.pause()
          })
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
