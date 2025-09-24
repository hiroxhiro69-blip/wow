addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  if (!id) return new Response("Missing ?id= parameter", { status: 400 })

  try {
    // Fetch the JSON from net50.cc
    const res = await fetch(`https://net50.cc/playlist.php?id=${id}`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    })
    const json = await res.json()

    if (!json?.sources?.length) {
      return new Response("No video sources found", { status: 404 })
    }

    const title = json.title || "Video"
    const poster = json.image2 || ""
    const sources = json.sources
    const subtitles = json.tracks || []

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
html, body { margin:0; height:100%; background:#000; font-family:sans-serif; overflow:hidden; }
#player { width:100%; height:100%; position:relative; }
video { width:100%; height:100%; object-fit:cover; background:#000; }
#controls { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:space-between; padding:10px; background:rgba(0,0,0,0.5); }
select, button { background:#222; color:#fff; border:none; padding:5px; border-radius:5px; cursor:pointer; }
</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
<div id="player">
  <video id="video" poster="${poster}" autoplay controls></video>
  <div id="controls">
    <label>Quality:</label>
    <select id="qualitySelect"></select>
    <label>Subtitles:</label>
    <select id="subtitleSelect"><option value="off">Off</option></select>
  </div>
</div>
<script>
const video = document.getElementById("video")
const qualitySelect = document.getElementById("qualitySelect")
const subtitleSelect = document.getElementById("subtitleSelect")
const sources = ${JSON.stringify(sources)}
const subtitles = ${JSON.stringify(subtitles)}
let hls = null

function initHls(src) {
  if(hls) { hls.destroy(); hls = null }
  if(Hls.isSupported()){
    hls = new Hls()
    hls.loadSource(src)
    hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, ()=> {
      // Populate quality select
      qualitySelect.innerHTML = ''
      hls.levels.forEach((level,index)=>{
        const option = document.createElement('option')
        option.value = index
        option.text = level.height + 'p'
        if(level.url === src) option.selected = true
        qualitySelect.appendChild(option)
      })
    })

    // Add subtitles
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, ()=>{})
  } else if(video.canPlayType('application/vnd.apple.mpegurl')){
    video.src = src
  }
}

// Populate subtitles
subtitles.forEach(track=>{
  if(track.kind === "captions"){
    const option = document.createElement('option')
    option.value = track.file
    option.text = track.label
    subtitleSelect.appendChild(option)
  }
})

// Subtitle switching
subtitleSelect.addEventListener("change", ()=>{
  const val = subtitleSelect.value
  // Remove existing tracks
  Array.from(video.textTracks).forEach(t=>t.mode="disabled")
  if(val !== "off"){
    let track = video.querySelector(`track[src="${val}"]`)
    if(!track){
      track = document.createElement('track')
      track.kind = "subtitles"
      track.label = "Subtitle"
      track.src = val
      track.default = true
      video.appendChild(track)
    }
    track.mode = "showing"
  }
})

// Quality switching
qualitySelect.addEventListener("change", ()=>{
  const index = parseInt(qualitySelect.value)
  if(hls && !isNaN(index)){
    const currTime = video.currentTime
    const paused = video.paused
    hls.currentLevel = index
    video.currentTime = currTime
    if(!paused) video.play()
  }
})

// Initialize first source
initHls(sources.find(s=>s.default || s.label==="Full HD").file)
</script>
</body>
</html>
`
    return new Response(html, { headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" } })
  } catch(err) {
    return new Response(err.toString(), { status:500 })
  }
}
