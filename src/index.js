addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const tmdbId = url.searchParams.get("tmdb")

  if (!tmdbId) return new Response("Missing ?tmdb= parameter", { status: 400 })

  try {
    // Fetch JSON from uEmbed
    const apiRes = await fetch(`https://uembed.site/api/videos/tmdb?id=${tmdbId}`)
    const json = await apiRes.json()

    if (!json?.length || !json[0].file) {
      return new Response("No streaming link found for this TMDB ID", { status: 404 })
    }

    const videoLink = json[0].file
    const title = json[0].title
    const poster = json[0].thumbnail

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        html, body {
          margin: 0; height: 100%; background: #000; font-family: 'Roboto', sans-serif; overflow: hidden;
        }
        #player {
          width: 100%; height: 100%; position: relative;
        }
        video {
          width: 100%; height: 100%; object-fit: cover;
          background: black;
        }
        #controls {
          position: absolute; bottom: 0; left: 0; right: 0;
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px; background: rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.3s;
        }
        #player:hover #controls { opacity: 1; }
        .btn { background: none; border: none; color: white; cursor: pointer; font-size: 18px; margin: 0 5px; }
        select { background: #222; color: #fff; border: none; padding: 5px; border-radius: 5px; }
        #titleOverlay {
          position: absolute; top: 10px; left: 10px; color: white; font-size: 20px;
          background: rgba(0,0,0,0.5); padding: 5px 10px; border-radius: 5px;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    </head>
    <body>
      <div id="player">
        <div id="titleOverlay">${title}</div>
        <video id="video" poster="${poster}" controls autoplay></video>
        <div id="controls">
          <button class="btn" id="playpause">⏯</button>
          <label>Audio:</label>
          <select id="audioSelect"><option value="default">Default</option></select>
          <label>Subtitles:</label>
          <select id="subtitleSelect"><option value="off">Off</option></select>
          <button class="btn" id="fullscreen">⛶</button>
        </div>
      </div>
      <script>
        const video = document.getElementById("video")
        const playpause = document.getElementById("playpause")
        const audioSelect = document.getElementById("audioSelect")
        const subtitleSelect = document.getElementById("subtitleSelect")
        const fullscreenBtn = document.getElementById("fullscreen")
        const hlsLink = "${videoLink}"

        function setAudioTrack(hls, index) {
          if(hls.audioTracks.length > 0) hls.audioTrack = index
        }

        function setSubtitleTrack(hls, index) {
          if(hls.subtitleTracks.length > 0) hls.subtitleTrack = index
        }

        if(Hls.isSupported()){
          const hls = new Hls({ enableWorker: true })
          hls.loadSource(hlsLink)
          hls.attachMedia(video)

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // Audio tracks
            if(hls.audioTracks.length > 0){
              audioSelect.innerHTML = ''
              hls.audioTracks.forEach((track, index)=>{
                const option = document.createElement('option')
                option.value = index
                option.text = track.name || "Audio " + (index+1)
                audioSelect.appendChild(option)
              })
            }
            // Subtitle tracks
            if(hls.subtitleTracks.length > 0){
              subtitleSelect.innerHTML = '<option value="off">Off</option>'
              hls.subtitleTracks.forEach((track, index)=>{
                const option = document.createElement('option')
                option.value = index
                option.text = track.name || "Subtitle " + (index+1)
                subtitleSelect.appendChild(option)
              })
            }
          })

          audioSelect.addEventListener("change", ()=>{
            const val = audioSelect.value
            setAudioTrack(hls, val === "default" ? 0 : parseInt(val))
          })

          subtitleSelect.addEventListener("change", ()=>{
            const val = subtitleSelect.value
            setSubtitleTrack(hls, val === "off" ? -1 : parseInt(val))
          })
        } else if(video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = hlsLink
        }

        playpause.addEventListener("click", ()=>{ video.paused ? video.play() : video.pause() })

        fullscreenBtn.addEventListener("click", ()=>{
          if(!document.fullscreenElement) video.requestFullscreen()
          else document.exitFullscreen()
        })

        // Double click fullscreen
        video.addEventListener("dblclick", ()=>{
          if(!document.fullscreenElement) video.requestFullscreen()
          else document.exitFullscreen()
        })
      </script>
    </body>
    </html>
    `

    return new Response(html, {
      headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" }
    })
  } catch(err) {
    return new Response(err.toString(), { status: 500 })
  }
}
