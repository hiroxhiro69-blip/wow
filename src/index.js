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
html, body {margin:0; height:100%; background:#000; font-family:'Roboto',sans-serif; overflow:hidden;}
#player{position:relative; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:black;}
video{width:100%; height:100%; object-fit:cover; background:black;}
#watermark{position:absolute; top:20px; left:20px; color:white; text-shadow:2px 2px 5px #000; font-size:20px; font-weight:bold; line-height:1.2;}
#centerPlay{position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); font-size:64px; color:rgba(255,255,255,0.8); cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:5;}
.skipBtn{position:absolute; top:50%; transform:translateY(-50%); font-size:36px; color:rgba(255,255,255,0.3); background:none; border:none; cursor:pointer; z-index:4; padding:0 20px; transition:0.3s; display:flex; align-items:center; justify-content:center;}
#skipBack{left:0;}
#skipForward{right:0;}
.skipBtn:hover{color:rgba(255,255,255,0.8);}
#controls{position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:flex-start; align-items:center; padding:10px; background:rgba(0,0,0,0.5);}
select, .btn{margin-left:10px; background:#222; color:#fff; border:none; padding:5px; border-radius:4px; font-size:14px;}
.btn{cursor:pointer;}
#progressContainer{position:absolute; bottom:50px; left:0; right:0; height:5px; background:rgba(255,255,255,0.2);}
#progress{width:0%; height:100%; background:#e50914;}
</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
<div id="player">
  <video id="video" poster="${poster}" autoplay></video>
  <div id="watermark">Your Watching<br>${title}</div>
  <button id="centerPlay">⏯</button>
  <button class="skipBtn" id="skipBack">⏪ 10s</button>
  <button class="skipBtn" id="skipForward">10s ⏩</button>
  <div id="progressContainer"><div id="progress"></div></div>
  <div id="controls">
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
const skipBack = document.getElementById("skipBack")
const skipForward = document.getElementById("skipForward")
const fullscreenBtn = document.getElementById("fullscreen")
const audioSelect = document.getElementById("audioSelect")
const subtitleSelect = document.getElementById("subtitleSelect")
const progress = document.getElementById("progress")
const hlsLink = "${videoLink}"
let audioTracksList = []
let currentTimeSaved = 0
let currentAudioIndex = 0

// Center play/pause
function togglePlay(){
  if(video.paused){ video.play(); centerPlay.style.display='none'}
  else{ video.pause(); centerPlay.style.display='flex'}
}
centerPlay.addEventListener("click", togglePlay)
video.addEventListener("click", togglePlay)
video.addEventListener("play",()=>{centerPlay.style.display='none'})
video.addEventListener("pause",()=>{centerPlay.style.display='flex'})

// Skip buttons
skipBack.addEventListener("click",()=>{video.currentTime=Math.max(0,video.currentTime-10)})
skipForward.addEventListener("click",()=>{video.currentTime=Math.min(video.duration,video.currentTime+10)})
fullscreenBtn.addEventListener("click",()=>{video.requestFullscreen()})

// Progress bar
video.addEventListener("timeupdate",()=>{
  progress.style.width = (video.currentTime/video.duration*100)+'%'
})

// HLS.js setup
if(Hls.isSupported()){
  const hls = new Hls({enableWebVTT:true})
  hls.loadSource(hlsLink)
  hls.attachMedia(video)

  // Fetch master playlist for audio tracks
  fetch(hlsLink).then(r=>r.text()).then(text=>{
    const regex = /#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="[^"]+",LANGUAGE="([^"]+)",NAME="([^"]+)",DEFAULT=(YES|NO),URI="([^"]+)"/g
    let match
    audioTracksList=[]
    while(match = regex.exec(text)){
      audioTracksList.push({lang:match[2],uri:match[4]})
    }
    if(audioTracksList.length>0){
      audioSelect.innerHTML=''
      audioTracksList.forEach((track,index)=>{
        const opt = document.createElement('option')
        opt.value = index
        opt.text = track.lang
        if(index===0) opt.selected = true
        audioSelect.appendChild(opt)
      })

      audioSelect.addEventListener("change", ()=>{
        const val = parseInt(audioSelect.value)
        const current = video.currentTime
        currentAudioIndex = val
        hls.loadSource(audioTracksList[val].uri)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, ()=>{
          video.currentTime = current
          video.play()
        })
      })
    }
  })

  // Subtitles
  hls.on(Hls.Events.MANIFEST_PARSED, ()=>{
    if(hls.subtitleTracks.length>0){
      subtitleSelect.innerHTML='<option value="off">Off</option>'
      hls.subtitleTracks.forEach((track,i)=>{
        const opt=document.createElement('option')
        opt.value=i
        opt.text=track.name||("Subtitle "+(i+1))
        subtitleSelect.appendChild(opt)
      })
    }
  })
}else if(video.canPlayType('application/vnd.apple.mpegurl')){
  video.src=hlsLink
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
