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
#player { width:100%; height:100%; position:relative; cursor:default; }
video { width:100%; height:100%; object-fit:cover; background:#000; }
#overlay { position:absolute; top:20px; left:20px; color:#fff; font-size:20px; font-weight:bold; text-shadow:2px 2px 5px #000; pointer-events:none; }
#centerPlay { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:64px; color:rgba(255,255,255,0.85); display:flex; align-items:center; justify-content:center; cursor:pointer; pointer-events:auto; }

/* Netflix-like controls */
#controls { position:absolute; left:0; right:0; bottom:0; padding:12px 16px 18px; background:linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0)); opacity:0; transform:translateY(10px); transition:opacity .25s ease, transform .25s ease; }
#player.show-controls #controls { opacity:1; transform:translateY(0); }
#player.hide-cursor { cursor:none; }
.row { display:flex; align-items:center; gap:10px; color:#fff; }
.btn { background:none; border:none; color:white; cursor:pointer; font-size:18px; padding:6px 8px; border-radius:4px; }
.btn:hover { background:rgba(255,255,255,0.1); }
.time { font-variant-numeric:tabular-nums; font-size:14px; color:#ddd; }

/* Seek bar */
#seekContainer { position:relative; height:6px; background:rgba(255,255,255,0.25); border-radius:3px; cursor:pointer; margin:8px 0 6px; }
#seekProgress { position:absolute; top:0; left:0; height:100%; width:0%; background:#e50914; border-radius:3px; }

/* Volume */
#volumeContainer { display:flex; align-items:center; gap:6px; }
#volume { -webkit-appearance:none; appearance:none; width:100px; height:4px; background:#666; border-radius:2px; outline:none; }
#volume::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:12px; height:12px; background:#fff; border-radius:50%; cursor:pointer; }

/* Audio menu */
#audioMenu { position:absolute; right:16px; bottom:56px; background:rgba(20,20,20,0.95); color:#fff; border-radius:6px; padding:8px 0; min-width:180px; display:none; box-shadow:0 8px 24px rgba(0,0,0,0.5); }
#audioMenu.show { display:block; }
.audio-item { padding:8px 14px; cursor:pointer; font-size:14px; }
.audio-item:hover { background:rgba(255,255,255,0.1); }
.audio-item.active { color:#e50914; font-weight:600; }

/* Left/right clusters */
.controls-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.controls-bottom { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.left, .right { display:flex; align-items:center; gap:8px; }
</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
<div id="player">
  <video id="video" poster="${poster}" autoplay></video>
  <div id="overlay">${title}</div>
  <button id="centerPlay">⏯</button>
  <div id="controls">
    <div id="seekContainer"><div id="seekProgress"></div></div>
    <div class="controls-bottom">
      <div class="left">
        <button class="btn" id="playPause">▶</button>
        <button class="btn" id="skipBack">⏪ 10</button>
        <button class="btn" id="skipForward">10 ⏩</button>
        <span class="time" id="timeLabel">00:00 / 00:00</span>
      </div>
      <div class="right">
        <div id="volumeContainer">
          <button class="btn" id="muteBtn">🔊</button>
          <input type="range" id="volume" min="0" max="1" step="0.05" value="1" />
        </div>
        <button class="btn" id="audioBtn">Audio ▾</button>
        <button class="btn" id="fullscreen">⛶</button>
      </div>
    </div>
    <div id="audioMenu"></div>
  </div>
</div>
<script>
const video = document.getElementById("video")
const centerPlay = document.getElementById("centerPlay")
const skipBack = document.getElementById("skipBack")
const skipForward = document.getElementById("skipForward")
const seekProgress = document.getElementById("seekProgress")
const seekContainer = document.getElementById("seekContainer")
const fullscreenBtn = document.getElementById("fullscreen")
const audioBtn = document.getElementById("audioBtn")
const audioMenu = document.getElementById("audioMenu")
const muteBtn = document.getElementById("muteBtn")
const volume = document.getElementById("volume")
const playPause = document.getElementById("playPause")
const timeLabel = document.getElementById("timeLabel")
const player = document.getElementById("player")

let hls = null
let audioSelect = null // virtual list source for Hls.js path
let controlsHideTimer = null

function renderAudioMenu(items, activeIndex){
  audioMenu.innerHTML = ''
  for (let i = 0; i < items.length; i++){
    const div = document.createElement('div')
    div.className = 'audio-item' + (i === activeIndex ? ' active' : '')
    div.dataset.index = String(i)
    div.textContent = items[i]
    audioMenu.appendChild(div)
  }
}

function buildAudioListFromHls(){
  const labels = []
  let selectedIndex = -1
  hls.audioTracks.forEach((track, index) => {
    const label = (track.name || track.lang || ('Track ' + (index+1))) + (track.lang && (track.name||'') !== track.lang ? ' ('+track.lang+')' : '')
    labels.push(label)
    if (track.default) selectedIndex = index
  })
  if (selectedIndex === -1) selectedIndex = hls.audioTrack || 0
  renderAudioMenu(labels, selectedIndex)
}

function buildAudioListFromNative(){
  const aTracks = video.audioTracks || []
  const labels = []
  let active = 0
  for (let i = 0; i < aTracks.length; i++){
    const t = aTracks[i]
    const label = (t.label || t.language || ('Track ' + (i+1))) + (t.language && (t.label||'') !== t.language ? ' ('+t.language+')' : '')
    labels.push(label)
    if (t.enabled) active = i
  }
  renderAudioMenu(labels, active)
}

function initPlayer(){
  if (window.Hls && Hls.isSupported()){
    hls = new Hls({
      enableWorker: true,
      capLevelToPlayerSize: false,
      // Keep video rendition stable when switching audio by not forcing auto right after
    })
    hls.loadSource("${videoLink}")
    hls.attachMedia(video)

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      buildAudioListFromHls()
    })

    // In case tracks update after start
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      buildAudioListFromHls()
    })

    // Keep the UI in sync if track is switched programmatically
    hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
      if (data && typeof data.id === 'number'){
        buildAudioListFromHls()
      }
    })

    audioMenu.addEventListener('click', (e) => {
      const target = e.target
      if (!target || !target.classList || !target.classList.contains('audio-item')) return
      const id = parseInt(target.dataset.index)
      const lockedLevel = hls.currentLevel
      hls.audioTrack = id
      if (lockedLevel !== undefined && lockedLevel !== null && lockedLevel >= 0){
        hls.currentLevel = lockedLevel
      }
      buildAudioListFromHls()
      if (video.paused === false){ video.play().catch(()=>{}) }
    })
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari / iOS: use native HLS
    video.src = "${videoLink}"
    video.addEventListener('loadedmetadata', () => {
      buildAudioListFromNative()
    })
    audioMenu.addEventListener('click', (e) => {
      const target = e.target
      if (!target || !target.classList || !target.classList.contains('audio-item')) return
      const idx = parseInt(target.dataset.index)
      const aTracks = video.audioTracks || []
      for (let i = 0; i < aTracks.length; i++){
        aTracks[i].enabled = (i === idx)
      }
      buildAudioListFromNative()
      if (video.paused === false){ video.play().catch(()=>{}) }
    })
  } else {
    // Fallback: try setting src anyway
    video.src = "${videoLink}"
  }
}

initPlayer()

// Center play toggle
function togglePlay(){
  if(video.paused){
    video.play(); centerPlay.style.display='none'; playPause.textContent='⏸'
  } else {
    video.pause(); centerPlay.style.display='flex'; playPause.textContent='▶'
  }
}
centerPlay.addEventListener("click", togglePlay)
video.addEventListener("click", togglePlay)
video.addEventListener("play", ()=>{ centerPlay.style.display='none' })
video.addEventListener("pause", ()=>{ centerPlay.style.display='flex' })

// Play/pause button
playPause.addEventListener('click', togglePlay)

// Skip buttons
skipBack.addEventListener("click", ()=>{ video.currentTime=Math.max(0,video.currentTime-10) })
skipForward.addEventListener("click", ()=>{ video.currentTime=Math.min(video.duration,video.currentTime+10) })

// Time/seek bar
function fmtTime(t){ if(!isFinite(t)) return '00:00'; const h=Math.floor(t/3600); const m=Math.floor((t%3600)/60); const s=Math.floor(t%60); return (h>0?(h+':'):'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0') }
function updateTime(){
  const percent = video.duration ? (video.currentTime / video.duration) * 100 : 0
  seekProgress.style.width = (percent)+"%"
  timeLabel.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration)
}
video.addEventListener('timeupdate', updateTime)
video.addEventListener('loadedmetadata', updateTime)
seekContainer.addEventListener('click', (e)=>{
  const rect = seekContainer.getBoundingClientRect()
  const clickPos = (e.clientX - rect.left)/rect.width
  video.currentTime = clickPos * video.duration
})

// Volume/mute
volume.addEventListener('input', ()=>{ video.volume = parseFloat(volume.value); video.muted = (video.volume===0); muteBtn.textContent = (video.muted?'🔇':'🔊') })
muteBtn.addEventListener('click', ()=>{ video.muted = !video.muted; if(!video.muted && video.volume===0){ video.volume=0.5; volume.value='0.5' } muteBtn.textContent = (video.muted?'🔇':'🔊') })

// Fullscreen
function toggleFullscreen(){
  if (!document.fullscreenElement){
    (player.requestFullscreen && player.requestFullscreen())
  } else {
    (document.exitFullscreen && document.exitFullscreen())
  }
}
fullscreenBtn.addEventListener("click", toggleFullscreen)
document.addEventListener('fullscreenchange', ()=>{ showControls() })

// Audio menu toggle
audioBtn.addEventListener('click', (e)=>{
  e.stopPropagation()
  audioMenu.classList.toggle('show')
  showControls()
})
document.addEventListener('click', ()=>{ audioMenu.classList.remove('show') })

// Auto-hide controls like Netflix
function showControls(){
  player.classList.add('show-controls')
  player.classList.remove('hide-cursor')
  if (controlsHideTimer) clearTimeout(controlsHideTimer)
  controlsHideTimer = setTimeout(()=>{
    player.classList.remove('show-controls')
    // keep controls visible if audio menu is open
    if (audioMenu.classList.contains('show')){
      player.classList.add('show-controls')
    } else {
      player.classList.add('hide-cursor')
    }
  }, 2000)
}
['mousemove','touchstart','keydown'].forEach(evt=>{ player.addEventListener(evt, showControls) })
showControls()

// Keyboard shortcuts
document.addEventListener('keydown', (e)=>{
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return
  if (e.code === 'Space'){ e.preventDefault(); togglePlay() }
  if (e.key === 'ArrowLeft'){ video.currentTime=Math.max(0,video.currentTime-10) }
  if (e.key === 'ArrowRight'){ video.currentTime=Math.min(video.duration,video.currentTime+10) }
  if (e.key === 'f' || e.key === 'F'){ toggleFullscreen() }
  if (e.key === 'm' || e.key === 'M'){ video.muted=!video.muted; muteBtn.textContent = (video.muted?'🔇':'🔊') }
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
