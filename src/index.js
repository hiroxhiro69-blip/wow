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

    // Fetch master M3U8 to get audio tracks
    const masterM3U8 = await fetch(videoLink).then(r => r.text())
    const audioLines = masterM3U8.split("\n").filter(l => l.startsWith("#EXT-X-MEDIA:TYPE=AUDIO"))
    const audioTracks = audioLines.map((line, index) => {
      const nameMatch = line.match(/NAME="([^"]+)"/)
      const langMatch = line.match(/LANGUAGE="([^"]+)"/)
      const uriMatch = line.match(/URI="([^"]+)"/)
      return {
        name: nameMatch ? nameMatch[1] : `Audio ${index+1}`,
        language: langMatch ? langMatch[1] : "",
        uri: uriMatch ? uriMatch[1] : null
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
html, body { margin:0; height:100%; background:#000; overflow:hidden; font-family:'Roboto',sans-serif; }
#player { width:100%; height:100%; position:relative; background:black; display:flex; justify-content:center; align-items:center; }
video { width:100%; height:100%; object-fit:cover; background:black; }
#overlay { position:absolute; top:20px; left:20px; color:#fff; font-size:20px; font-weight:bold; text-shadow:2px 2px 5px #000; }
#overlay div { display:block; }
#controls { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(0,0,0,0.5); opacity:0; transition:opacity 0.3s; }
#player:hover #controls { opacity:1; }
.btn { background:none; border:none; color:white; cursor:pointer; font-size:18px; margin:0 5px; }
select { background:#222; color:#fff; border:none; padding:5px; border-radius:5px; }
#centerPlay { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:64px; color:rgba(255,255,255,0.8); display:flex; align-items:center; justify-content:center; cursor:pointer; pointer-events:auto; }
.skipBtn { position:absolute; top:50%; transform:translateY(-50%); font-size:36px; color:rgba(255,255,255,0.5); background:none; border:none; cursor:pointer; z-index:2; padding:0 20px; }
#skipBack { left:10px; }
#skipForward { right:10px; }
#progressContainer { position:absolute; bottom:50px; left:0; right:0; height:5px; background:rgba(255,255,255,0.2); cursor:pointer; }
#progress { width:0%; height:100%; background:#e50914; }
</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
<div id="player">
  <video id="video" poster="${poster}" autoplay></video>
  <div id="overlay"><div>Your Watching</div><div>${title}</div></div>
  <button id="centerPlay">⏯</button>
  <button class="skipBtn" id="skipBack">⏪10s</button>
  <button class="skipBtn" id="skipForward">10s⏩</button>
  <div id="progressContainer"><div id="progress"></div></div>
  <div id="controls">
    <label>Audio:</label>
    <select id="audioSelect"><option value="">Loading...</option></select>
    <label>Subtitles:</label>
    <select id="subtitleSelect"><option value="off">Off</option></select>
    <button class="btn" id="fullscreen">⛶</button>
  </div>
</div>
<script>
const video = document.getElementById("video")
const centerPlay = document.getElementById("centerPlay")
const skipBack = document.getElementById("skipBack")
const skipForward = document.getElementById("skipForward")
const fullscreenBtn = document.getElementById("fullscreen")
const audioSelect = document.getElementById("audioSelect")
const subtitleSelect = document.getElementById("subtitleSelect")
const progress = document.getElementById("progress")
const progressContainer = document.getElementById("progressContainer")
const hlsLink = "${videoLink}"
const audioTracks = ${JSON.stringify(audioTracks)}

// Center play toggle
function togglePlay(){ if(video.paused){ video.play(); centerPlay.style.display='none' } else { video.pause(); centerPlay.style.display='flex' } }
centerPlay.addEventListener("click", togglePlay)
video.addEventListener("click", togglePlay)
video.addEventListener("play", ()=>{ centerPlay.style.display='none' })
video.addEventListener("pause", ()=>{ centerPlay.style.display='flex' })

// Skip buttons
skipBack.addEventListener("click", ()=>{ video.currentTime = Math.max(0, video.currentTime - 10) })
skipForward.addEventListener("click", ()=>{ video.currentTime = Math.min(video.duration, video.currentTime + 10) })

// Fullscreen
fullscreenBtn.addEventListener("click", ()=>{ video.requestFullscreen() })

// Progress bar
video.addEventListener("timeupdate", ()=>{ progress.style.width = ((video.currentTime/video.duration)*100) + '%' })
progressContainer.addEventListener("click", (e)=>{
  const rect = progressContainer.getBoundingClientRect()
  const clickPos = (e.clientX - rect.left)/rect.width
  video.currentTime = clickPos * video.duration
})

if(Hls.isSupported()){
  const hls = new Hls()
  hls.loadSource(hlsLink)
  hls.attachMedia(video)

  // Populate audio tracks manually
  audioSelect.innerHTML = ''
  audioTracks.forEach(track=>{
  if(track.uri) {
    const option = document.createElement("option")
    option.value = track.uri
    option.text = track.name + " (" + track.language + ")"
    audioSelect.appendChild(option)
  }
})

  

  audioSelect.addEventListener("change", async ()=>{
    const selectedURI = audioSelect.value
    if(selectedURI){
      const currentTime = video.currentTime
      hls.destroy() // Destroy current Hls instance
      const newHls = new Hls()
      newHls.loadSource(selectedURI)
      newHls.attachMedia(video)
      newHls.on(Hls.Events.MANIFEST_PARSED, ()=>{
        video.currentTime = currentTime
        video.play()
      })
    }
  })

  hls.on(Hls.Events.MANIFEST_PARSED, ()=>{
    if(hls.subtitleTracks.length>0){
      subtitleSelect.innerHTML='<option value="off">Off</option>'
      hls.subtitleTracks.forEach((track,index)=>{
        const option=document.createElement('option')
        option.value=index
        option.text=track.name||("Subtitle "+(index+1))
        subtitleSelect.appendChild(option)
      })
    }
  })

  subtitleSelect.addEventListener("change", ()=>{
    const val = subtitleSelect.value
    hls.subtitleTrack = val==='off'? -1:parseInt(val)
  })
}else if(video.canPlayType('application/vnd.apple.mpegurl')){
  video.src = hlsLink
}
</script>
</body>
</html>
`

    return new Response(html, { headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" } })
  } catch(err) {
    return new Response(err.toString(), { status:500 })
  }
} 
