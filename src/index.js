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

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
html, body { margin:0; height:100%; background:#000; font-family:'Roboto',sans-serif; overflow:hidden; }
#player { width:100%; height:100%; position:relative; }
video { width:100%; height:100%; object-fit:cover; background:#000; }
#overlay { position:absolute; top:20px; left:20px; color:#fff; font-size:20px; font-weight:bold; text-shadow:2px 2px 5px #000; }
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
  <div id="overlay">${title}</div>
  <button id="centerPlay">⏯</button>
  <button class="skipBtn" id="skipBack">⏪10s</button>
  <button class="skipBtn" id="skipForward">10s⏩</button>
  <div id="progressContainer"><div id="progress"></div></div>
  <div id="controls">
    <label>Audio:</label>
    <select id="audioSelect"><option>Loading...</option></select>
    <button class="btn" id="fullscreen">⛶</button>
  </div>
</div>
<script>
const video = document.getElementById("video")
const centerPlay = document.getElementById("centerPlay")
const skipBack = document.getElementById("skipBack")
const skipForward = document.getElementById("skipForward")
const progress = document.getElementById("progress")
const progressContainer = document.getElementById("progressContainer")
const fullscreenBtn = document.getElementById("fullscreen")
const audioSelect = document.getElementById("audioSelect")

const hls = new Hls()
hls.loadSource("${videoLink}")
hls.attachMedia(video)

hls.on(Hls.Events.MANIFEST_PARSED, () => {
  // Populate audio tracks
  audioSelect.innerHTML = ''
  hls.audioTracks.forEach((track, index) => {
    const option = document.createElement('option')
    option.value = index
    option.text = track.name + (track.lang ? ' ('+track.lang+')' : '')
    if(track.default) option.selected = true
    audioSelect.appendChild(option)
  })
})

// Audio track switching
audioSelect.addEventListener('change', () => {
  hls.audioTrack = parseInt(audioSelect.value)
})

// Center play toggle
function togglePlay(){
  if(video.paused){
    video.play(); centerPlay.style.display='none'
  } else {
    video.pause(); centerPlay.style.display='flex'
  }
}
centerPlay.addEventListener("click", togglePlay)
video.addEventListener("click", togglePlay)
video.addEventListener("play", ()=>{ centerPlay.style.display='none' })
video.addEventListener("pause", ()=>{ centerPlay.style.display='flex' })

// Skip buttons
skipBack.addEventListener("click", ()=>{ video.currentTime=Math.max(0,video.currentTime-10) })
skipForward.addEventListener("click", ()=>{ video.currentTime=Math.min(video.duration,video.currentTime+10) })

// Progress bar
video.addEventListener("timeupdate", ()=>{ progress.style.width = ((video.currentTime/video.duration)*100)+'%' })
progressContainer.addEventListener("click",(e)=>{
  const rect = progressContainer.getBoundingClientRect()
  const clickPos = (e.clientX - rect.left)/rect.width
  video.currentTime = clickPos * video.duration
})

// Fullscreen
fullscreenBtn.addEventListener("click", ()=>{ video.requestFullscreen() })
</script>
</body>
</html>
`
    return new Response(html, { headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" } })
  } catch(err){
    return new Response(err.toString(), { status: 500 })
  }
}
