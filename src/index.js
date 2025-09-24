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

    // Fetch master M3U8 to parse audio tracks
    const masterM3U8 = await fetchText(videoLink)
    const audioLines = masterM3U8.split("\n").filter(l => l.startsWith("#EXT-X-MEDIA:TYPE=AUDIO"))
    const audioTracks = audioLines.map((line, index) => {
      const nameMatch = line.match(/NAME="([^"]+)"/)
      const langMatch = line.match(/LANGUAGE="([^"]+)"/)
      const uriMatch = line.match(/URI="([^"]+)"/)
      return {
        name: nameMatch ? nameMatch[1] : null,
        lang: langMatch ? langMatch[1] : "",
        uri: uriMatch ? new URL(uriMatch[1], videoLink).href : null
      }
    })

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
#audioPlayer { display:none; }
#overlay { position:absolute; top:20px; left:20px; color:#fff; font-size:20px; font-weight:bold; text-shadow:2px 2px 5px #000; }
#controls { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(0,0,0,0.5); opacity:0; transition:opacity 0.3s; }
#player:hover #controls { opacity:1; }
select { background:#222; color:#fff; border:none; padding:5px; border-radius:5px; }
.btn { background:none; border:none; color:white; cursor:pointer; font-size:18px; margin:0 5px; }
#centerPlay { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:64px; color:rgba(255,255,255,0.8); display:flex; align-items:center; justify-content:center; cursor:pointer; pointer-events:auto; }
</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
<div id="player">
  <video id="video" poster="${poster}" autoplay></video>
  <audio id="audioPlayer" autoplay></audio>
  <div id="overlay">${title}</div>
  <button id="centerPlay">⏯</button>
  <div id="controls">
    <label>Audio:</label>
    <select id="audioSelect"><option>Loading...</option></select>
    <button class="btn" id="fullscreen">⛶</button>
  </div>
</div>
<script>
const video = document.getElementById("video")
const audioPlayer = document.getElementById("audioPlayer")
const centerPlay = document.getElementById("centerPlay")
const audioSelect = document.getElementById("audioSelect")
const fullscreenBtn = document.getElementById("fullscreen")
const hlsLink = "${videoLink}"
const audioTracks = ${JSON.stringify(audioTracks)}

// Initialize HLS for video
let hlsVideo = null
if(Hls.isSupported()){
  hlsVideo = new Hls()
  hlsVideo.loadSource(hlsLink)
  hlsVideo.attachMedia(video)
} else if(video.canPlayType('application/vnd.apple.mpegurl')){
  video.src = hlsLink
}

// Populate audio dropdown
audioSelect.innerHTML = ''
audioTracks.forEach((track, index) => {
  if(track.uri){
    const option = document.createElement('option')
    option.value = track.uri
    // FIX: parentheses around fallback for Wrangler
    option.text = (track.name || ("Audio " + (index+1))) + (track.lang ? ` (${track.lang})` : '')
    audioSelect.appendChild(option)
  }
})
if(audioTracks[0] && audioTracks[0].uri) audioPlayer.src = audioTracks[0].uri

// Sync audio with video
video.addEventListener('timeupdate', ()=>{ audioPlayer.currentTime = video.currentTime })

// Center play toggle
function togglePlay(){
  if(video.paused){
    video.play()
    audioPlayer.play()
    centerPlay.style.display='none'
  } else {
    video.pause()
    audioPlayer.pause()
    centerPlay.style.display='flex'
  }
}
centerPlay.addEventListener("click", togglePlay)
video.addEventListener("click", togglePlay)
video.addEventListener("play", ()=>{ audioPlayer.play(); centerPlay.style.display='none' })
video.addEventListener("pause", ()=>{ audioPlayer.pause(); centerPlay.style.display='flex' })

// Fullscreen
fullscreenBtn.addEventListener("click", ()=>{ video.requestFullscreen() })

// Change audio track without affecting video
audioSelect.addEventListener("change", ()=>{
  const selectedURI = audioSelect.value
  if(selectedURI){
    const currTime = video.currentTime
    audioPlayer.src = selectedURI
    audioPlayer.currentTime = currTime
    if(!video.paused) audioPlayer.play()
  }
})
</script>
</body>
</html>
`

    return new Response(html, { headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" } })
  } catch(err){
    return new Response(err.toString(), { status: 500 })
  }
}
