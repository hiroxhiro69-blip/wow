addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

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
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  html, body { margin:0; height:100%; background:#000; overflow:hidden; font-family:'Roboto',sans-serif; }
  #player { width:100%; height:100%; position:relative; background:black; display:flex; justify-content:center; align-items:center; }
  video { width:100%; height:100%; object-fit:cover; background:black; }
  #overlay { position:absolute; top:20px; left:20px; color:#fff; font-size:20px; font-weight:bold; text-shadow:2px 2px 5px #000; line-height:1.2; }
  #overlay span { display:block; }
  #controls { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(0,0,0,0.5); opacity:0; transition:opacity 0.3s; }
  #player:hover #controls { opacity:1; }
  .btn { background:none; border:none; color:white; cursor:pointer; font-size:18px; margin:0 5px; }
  select { background:#222; color:#fff; border:none; padding:5px; border-radius:5px; }
  #centerPlay { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:64px; color:rgba(255,255,255,0.8); display:flex; align-items:center; justify-content:center; cursor:pointer; pointer-events:auto; z-index:2; }
  .skipBtn { position:absolute; top:50%; transform:translateY(-50%); font-size:36px; color:rgba(255,255,255,0.5); background:none; border:none; cursor:pointer; z-index:2; padding:0 20px; }
  #skipBack { left:10px; }
  #skipForward { right:10px; }
  #progressContainer { flex:1; height:6px; background:#555; border-radius:3px; margin:0 10px; cursor:pointer; position:relative; }
  #progress { width:0%; height:100%; background:#f00; border-radius:3px; }
</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
<div id="player">
  <video id="video" poster="${poster}" autoplay></video>
  <div id="overlay"><span>Your Watching</span><span>${title}</span></div>
  <button id="centerPlay">⏯</button>
  <button class="skipBtn" id="skipBack">⏪10s</button>
  <button class="skipBtn" id="skipForward">10s⏩</button>
  <div id="controls">
    <button class="btn" id="playpause">⏯</button>
    <div id="progressContainer">
      <div id="progress"></div>
    </div>
    <label>Audio:</label>
    <select id="audioSelect"><option value="default">Default</option></select>
    <label>Subtitles:</label>
    <select id="subtitleSelect"><option value="off">Off</option></select>
    <button class="btn" id="fullscreen">⛶</button>
  </div>
</div>

<script>
const video = document.getElementById("video")
const centerPlay = document.getElementById("centerPlay")
const playpause = document.getElementById("playpause")
const skipBack = document.getElementById("skipBack")
const skipForward = document.getElementById("skipForward")
const fullscreenBtn = document.getElementById("fullscreen")
const audioSelect = document.getElementById("audioSelect")
const subtitleSelect = document.getElementById("subtitleSelect")
const progressContainer = document.getElementById("progressContainer")
const progress = document.getElementById("progress")
let hls

// Toggle play/pause
function togglePlay() {
  if(video.paused){ video.play(); centerPlay.style.display='none' }
  else { video.pause(); centerPlay.style.display='flex' }
}
centerPlay.addEventListener("click", togglePlay)
video.addEventListener("click", togglePlay)
playpause.addEventListener("click", togglePlay)
video.addEventListener("play", ()=>{ centerPlay.style.display='none' })
video.addEventListener("pause", ()=>{ centerPlay.style.display='flex' })

// Skip 10s
skipBack.addEventListener("click", ()=>{ video.currentTime = Math.max(0, video.currentTime - 10) })
skipForward.addEventListener("click", ()=>{ video.currentTime = Math.min(video.duration, video.currentTime + 10) })

// Fullscreen
fullscreenBtn.addEventListener("click", ()=>{ video.requestFullscreen() })

// Progress bar update
video.addEventListener("timeupdate", ()=>{
  const percent = (video.currentTime / video.duration)*100
  progress.style.width = percent+"%"
})
// Seek video
progressContainer.addEventListener("click", e=>{
  const rect = progressContainer.getBoundingClientRect()
  const pct = (e.clientX - rect.left)/rect.width
  video.currentTime = pct * video.duration
})

// HLS setup
if(Hls.isSupported()){
  hls = new Hls()
  hls.loadSource("${videoLink}")
  hls.attachMedia(video)

  hls.on(Hls.Events.MANIFEST_PARSED, ()=>{
    // Audio tracks
    if(hls.audioTracks.length>0){
      audioSelect.innerHTML=''
      hls.audioTracks.forEach((track,index)=>{
        const option=document.createElement('option')
        option.value=index
        option.text=track.name||("Audio "+(index+1))
        audioSelect.appendChild(option)
      })
    }
    // Subtitles
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

  // Switch audio without losing currentTime
  audioSelect.addEventListener("change", ()=>{
    const currentTime = video.currentTime
    const val = audioSelect.value
    hls.audioTrack = val==='default'?0:parseInt(val)
    setTimeout(()=>{ video.currentTime = currentTime }, 50)
  })

  // Switch subtitles
  subtitleSelect.addEventListener("change", ()=>{
    const val = subtitleSelect.value
    hls.subtitleTrack = val==='off'? -1:parseInt(val)
  })

}else if(video.canPlayType('application/vnd.apple.mpegurl')){
  video.src = "${videoLink}"
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
