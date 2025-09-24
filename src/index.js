addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  return await res.text()
}

async function handleRequest(request) {
  const url = new URL(request.url)
  const tmdbId = url.searchParams.get("tmdb")
  if (!tmdbId) return new Response("Missing ?tmdb= parameter", { status: 400 })

  try {
    const apiRes = await fetch(`https://uembed.site/api/videos/tmdb?id=${tmdbId}`)
    const json = await apiRes.json()

    if (!json?.length || !json[0].file) {
      return new Response("No streaming link found for this TMDB ID", { status: 404 })
    }

    const videoLink = json[0].file
    const title = json[0].title
    const poster = json[0].thumbnail

    // Fetch master playlist to parse audio/subtitles
    const manifest = await fetchText(videoLink)
    const audioTracks = []
    const subtitleTracks = []

    const lines = manifest.split("\n")
    lines.forEach(line => {
      if (line.startsWith("#EXT-X-MEDIA")) {
        if (line.includes("TYPE=AUDIO")) {
          const nameMatch = line.match(/NAME="([^"]+)"/)
          const uriMatch = line.match(/URI="([^"]+)"/)
          if (nameMatch && uriMatch) {
            audioTracks.push({ name: nameMatch[1], uri: new URL(uriMatch[1], videoLink).href })
          }
        }
        if (line.includes("TYPE=SUBTITLES")) {
          const nameMatch = line.match(/NAME="([^"]+)"/)
          const uriMatch = line.match(/URI="([^"]+)"/)
          if (nameMatch && uriMatch) {
            subtitleTracks.push({ name: nameMatch[1], uri: new URL(uriMatch[1], videoLink).href })
          }
        }
      }
    })

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        html, body { margin:0; height:100%; background:#000; font-family:'Roboto',sans-serif; overflow:hidden; }
        #player { width:100%; height:100%; position:relative; background:black; display:flex; justify-content:center; align-items:center; }
        video { width:100%; height:100%; object-fit:cover; background:black; }
        #overlay { position:absolute; top:20px; left:20px; color:#fff; font-size:24px; font-weight:bold; text-shadow:2px 2px 5px #000; }
        #controls { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(0,0,0,0.5); opacity:0; transition:opacity 0.3s; }
        #player:hover #controls { opacity:1; }
        .btn { background:none; border:none; color:white; cursor:pointer; font-size:18px; margin:0 5px; }
        select { background:#222; color:#fff; border:none; padding:5px; border-radius:5px; }
        #centerPlay { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:64px; color:rgba(255,255,255,0.8); display:none; cursor:pointer; }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    </head>
    <body>
      <div id="player">
        <video id="video" poster="${poster}" autoplay></video>
        <div id="overlay">${title}</div>
        <div id="controls">
          <button class="btn" id="rewind">⏪10s</button>
          <button class="btn" id="playpause">⏯</button>
          <button class="btn" id="forward">10s⏩</button>
          <label>Audio:</label>
          <select id="audioSelect"><option value="default">Default</option></select>
          <label>Subtitles:</label>
          <select id="subtitleSelect"><option value="off">Off</option></select>
          <button class="btn" id="fullscreen">⛶</button>
        </div>
        <div id="centerPlay">⏯</div>
      </div>
      <script>
        const video = document.getElementById("video")
        const playpause = document.getElementById("playpause")
        const rewind = document.getElementById("rewind")
        const forward = document.getElementById("forward")
        const fullscreenBtn = document.getElementById("fullscreen")
        const centerPlay = document.getElementById("centerPlay")
        const audioSelect = document.getElementById("audioSelect")
        const subtitleSelect = document.getElementById("subtitleSelect")
        const hlsLink = "${videoLink}"
        const audioTracks = ${JSON.stringify(audioTracks)}
        const subtitleTracks = ${JSON.stringify(subtitleTracks)}

        function togglePlay() {
          if(video.paused){ video.play(); centerPlay.style.display='none' }
          else { video.pause(); centerPlay.style.display='block' }
        }

        playpause.addEventListener("click", togglePlay)
        centerPlay.addEventListener("click", togglePlay)

        rewind.addEventListener("click", ()=>{ video.currentTime = Math.max(0, video.currentTime - 10) })
        forward.addEventListener("click", ()=>{ video.currentTime = Math.min(video.duration, video.currentTime + 10) })
        fullscreenBtn.addEventListener("click", ()=>{ video.requestFullscreen() })

        if(Hls.isSupported()){
          const hls = new Hls()
          hls.loadSource(hlsLink)
          hls.attachMedia(video)

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if(audioTracks.length>0){
              audioSelect.innerHTML = ''
              audioTracks.forEach((track,index)=>{
                const option = document.createElement('option')
                option.value=index
                option.text=track.name
                audioSelect.appendChild(option)
              })
            }

            if(subtitleTracks.length>0){
              subtitleSelect.innerHTML='<option value="off">Off</option>'
              subtitleTracks.forEach((track,index)=>{
                const option = document.createElement('option')
                option.value=index
                option.text=track.name
                subtitleSelect.appendChild(option)
              })
            }
          })

          audioSelect.addEventListener("change", ()=>{
            const val = audioSelect.value
            hls.audioTrack = val==='default'? 0 : parseInt(val)
          })

          subtitleSelect.addEventListener("change", ()=>{
            const val = subtitleSelect.value
            hls.subtitleTrack = val==='off'? -1 : parseInt(val)
          })
        } else if(video.canPlayType('application/vnd.apple.mpegurl')){
          video.src = hlsLink
        }
      </script>
    </body>
    </html>
    `

    return new Response(html, { headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" } })
  } catch(err){
    return new Response(err.toString(), { status: 500 })
  }
}
