addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  return await res.text()
}

async function handleRequest(request) {
  const url = new URL(request.url)
  // Allow only requests coming from the specified site
  const allowedOrigin = 'https://hiroxstream.pages.dev'
  const origin = request.headers.get('Origin') || ''
  const referer = request.headers.get('Referer') || ''
  const isAllowed = origin === allowedOrigin || referer.startsWith(allowedOrigin)

  if (!isAllowed) {
    const offlineHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline</title>
  <style>
    html, body { margin:0; height:100%; background:#000; color:#fff; display:flex; align-items:center; justify-content:center; font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif }
    .card { text-align:center; padding:24px; background:#111; border:1px solid #222; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.5) }
    h1 { margin:0 0 8px; font-size:22px }
    p { margin:0; color:#bbb }
  </style>
  </head>
<body>
  <div class="card">
    <h1>Offline</h1>
    <p>This content is only available on hiroxstream.pages.dev</p>
  </div>
</body>
</html>`
    return new Response(offlineHtml, { status: 403, headers: { 'Content-Type': 'text/html' } })
  }
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
#watermark { position:absolute; top:20px; right:20px; padding:6px 12px; font-size:14px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,0.85); background:rgba(0,0,0,0.45); border-radius:6px; pointer-events:none; backdrop-filter:blur(4px); }
#centerPlay { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:64px; color:rgba(255,255,255,0.85); display:flex; align-items:center; justify-content:center; cursor:pointer; pointer-events:auto; }

/* Netflix-like controls */
#controls { position:absolute; left:0; right:0; bottom:0; padding:12px 16px calc(18px + env(safe-area-inset-bottom)); background:linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0)); opacity:0; transform:translateY(10px); transition:opacity .25s ease, transform .25s ease; }
#player.show-controls #controls { opacity:1; transform:translateY(0); }
#player.hide-cursor { cursor:none; }
.row { display:flex; align-items:center; gap:10px; color:#fff; }
.btn { background:none; border:none; color:white; cursor:pointer; font-size:18px; padding:6px 8px; border-radius:4px; }
.btn:hover { background:rgba(255,255,255,0.1); }
.time { font-variant-numeric:tabular-nums; font-size:14px; color:#ddd; }

/* Seek bar */
#seekContainer { position:relative; height:6px; background:rgba(255,255,255,0.25); border-radius:3px; cursor:pointer; margin:8px 0 6px; touch-action:none; }
#seekProgress { position:absolute; top:0; left:0; height:100%; width:0%; background:#e50914; border-radius:3px; }

/* Volume */
#volumeContainer { display:flex; align-items:center; gap:6px; }
#volume { -webkit-appearance:none; appearance:none; width:100px; height:4px; background:#666; border-radius:2px; outline:none; }
#volume::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:12px; height:12px; background:#fff; border-radius:50%; cursor:pointer; }

/* Audio menu */
#audioMenu { position:absolute; right:16px; bottom:56px; background:rgba(20,20,20,0.95); color:#fff; border-radius:6px; padding:8px 0; min-width:180px; display:none; box-shadow:0 8px 24px rgba(0,0,0,0.5); max-height:50vh; overflow:auto; }
#audioMenu.show { display:block; }
.audio-item { padding:8px 14px; cursor:pointer; font-size:14px; }
.audio-item:hover { background:rgba(255,255,255,0.1); }
.audio-item.active { color:#e50914; font-weight:600; }

/* Quality & Speed menus */
#qualityMenu, #speedMenu { position:absolute; right:16px; bottom:56px; background:rgba(20,20,20,0.95); color:#fff; border-radius:6px; padding:8px 0; min-width:180px; display:none; box-shadow:0 8px 24px rgba(0,0,0,0.5); max-height:50vh; overflow:auto; }
#qualityMenu.show, #speedMenu.show { display:block; }
.menu-item { padding:8px 14px; cursor:pointer; font-size:14px; }
.menu-item:hover { background:rgba(255,255,255,0.1); }
.menu-item.active { color:#e50914; font-weight:600; }

/* Spinner */
#spinner { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:48px; height:48px; border:4px solid rgba(255,255,255,0.2); border-top-color:#fff; border-radius:50%; animation:spin 1s linear infinite; display:none; }
@keyframes spin { to { transform:translate(-50%,-50%) rotate(360deg); } }

/* Gesture zones */
#zoneLeft, #zoneRight { position:absolute; top:0; bottom:0; width:35%; cursor:pointer; }
#zoneLeft { left:0; }
#zoneRight { right:0; }

/* Mobile-first tweaks */
@media (max-width: 768px) {
  .btn { font-size:22px; padding:10px 12px; }
  .time { font-size:13px; }
  #seekContainer { height:10px; margin:10px 0 8px; }
  #volume { width:80px; height:6px; }
  .controls-bottom { gap:8px; }
  .left, .right { gap:6px; }
  /* Menus as bottom sheets */
  #audioMenu, #qualityMenu, #speedMenu { position:fixed; left:0; right:0; bottom:0; border-radius:12px 12px 0 0; padding-bottom:calc(12px + env(safe-area-inset-bottom)); margin:0 0; max-height:45vh; }
  .audio-item, .menu-item { padding:14px 18px; font-size:16px; }
  #zoneLeft, #zoneRight { width:45%; }
}

/* Left/right clusters */
.controls-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.controls-bottom { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.left, .right { display:flex; align-items:center; gap:8px; }

/* Seek badges (Netflix-like) */
.seek-badge { position:absolute; top:50%; transform:translateY(-50%); color:#fff; font-weight:700; font-size:52px; opacity:0; pointer-events:none; text-shadow:0 4px 10px rgba(0,0,0,0.6); display:flex; align-items:center; gap:10px; filter:drop-shadow(0 8px 24px rgba(0,0,0,0.6)); }
.seek-badge.left { left:10%; }
.seek-badge.right { right:10%; }
.seek-badge svg { width:48px; height:48px; }
@keyframes seek-pop { 0% { opacity:0; transform:translateY(-50%) scale(0.9) } 10% { opacity:1; transform:translateY(-50%) scale(1) } 80% { opacity:1 } 100% { opacity:0; transform:translateY(-50%) scale(1) } }
.seek-badge.show { animation:seek-pop 700ms ease; }

/* Rotate overlay for mobile portrait while in fullscreen */
#rotateOverlay { position:absolute; inset:0; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,0.85); color:#fff; text-align:center; padding:24px; font-size:18px; }
#rotateOverlay .box { background:#111; border:1px solid #222; border-radius:12px; padding:18px 22px; }
</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
<div id="player">
  <video id="video" poster="${poster}" autoplay playsinline webkit-playsinline x5-playsinline></video>
  <div id="overlay">${title}</div>
  <div id="watermark">HiroXStream</div>
  <button id="centerPlay">⏯</button>
  <div id="spinner"></div>
  <div id="zoneLeft"></div>
  <div id="zoneRight"></div>
  <div id="seekBadgeLeft" class="seek-badge left">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
    <span>-10s</span>
  </div>
  <div id="seekBadgeRight" class="seek-badge right">
    <span>+10s</span>
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8.59 16.59 1.41 1.41L16 12l-5.99-6L8.6 7.41 13.17 12z"/></svg>
  </div>
  <div id="rotateOverlay"><div class="box">Rotate your device for the best experience</div></div>
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
        <button class="btn" id="qualityBtn">Quality ▾</button>
        <button class="btn" id="speedBtn">Speed ▾</button>
        <button class="btn" id="pipBtn">PiP</button>
    <button class="btn" id="fullscreen">⛶</button>
      </div>
    </div>
    <div id="audioMenu"></div>
    <div id="qualityMenu"></div>
    <div id="speedMenu"></div>
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
const qualityBtn = document.getElementById("qualityBtn")
const qualityMenu = document.getElementById("qualityMenu")
const speedBtn = document.getElementById("speedBtn")
const speedMenu = document.getElementById("speedMenu")
const pipBtn = document.getElementById("pipBtn")
const spinner = document.getElementById("spinner")
const zoneLeft = document.getElementById("zoneLeft")
const zoneRight = document.getElementById("zoneRight")
const seekBadgeLeft = document.getElementById("seekBadgeLeft")
const seekBadgeRight = document.getElementById("seekBadgeRight")
const rotateOverlay = document.getElementById("rotateOverlay")
const muteBtn = document.getElementById("muteBtn")
const volume = document.getElementById("volume")
const playPause = document.getElementById("playPause")
const timeLabel = document.getElementById("timeLabel")
const player = document.getElementById("player")

// Ensure inline playback on mobile browsers and keep custom controls active
video.setAttribute('playsinline', 'true')
video.setAttribute('webkit-playsinline', 'true')
video.setAttribute('x5-playsinline', 'true')
video.playsInline = true
video.controls = false

let hls = null
let audioSelect = null // virtual list source for Hls.js path
let controlsHideTimer = null
const storageKey = 'player:' + (${tmdbId?('"'+tmdbId+'"'):'"unknown"'})

// Mobile landscape helper
function isMobileCoarse(){
  try { return window.matchMedia && window.matchMedia('(pointer: coarse)').matches } catch(_e){ return false }
}
async function lockLandscapeIfPossible(){
  if (!isMobileCoarse()) return
  try {
    if (!document.fullscreenElement && (video.requestFullscreen || player.requestFullscreen)){
      if (video.requestFullscreen){ await video.requestFullscreen() } else { await player.requestFullscreen() }
    }
    if (screen.orientation && screen.orientation.lock){ await screen.orientation.lock('landscape') }
  } catch(_e){}
}
function unlockOrientationIfPossible(){
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock() } catch(_e){}
}

function updateOrientationUI(){
  if (!isMobileCoarse()) return
  const isFs = !!document.fullscreenElement
  const isPortrait = window.innerHeight > window.innerWidth
  rotateOverlay.style.display = (isFs && isPortrait) ? 'flex' : 'none'
}

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
      startLevel: -1,
      maxBufferLength: 30,
      maxLiveSyncPlaybackRate: 1.5,
      liveDurationInfinity: true
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
// Attempt to lock to landscape on mobile when playback starts
video.addEventListener('play', ()=>{ lockLandscapeIfPossible() })

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
// Touch drag seek
let seekingTouch = false
let lastTouchX = 0
seekContainer.addEventListener('touchstart', (e)=>{ if(!e.touches||!e.touches[0]) return; seekingTouch=true; lastTouchX=e.touches[0].clientX })
seekContainer.addEventListener('touchmove', (e)=>{
  if(!seekingTouch) return; if(!e.touches||!e.touches[0]) return
  const rect = seekContainer.getBoundingClientRect()
  const x = e.touches[0].clientX
  const pos = Math.max(0, Math.min(1, (x - rect.left)/rect.width))
  video.currentTime = pos * video.duration
})
seekContainer.addEventListener('touchend', ()=>{ seekingTouch=false })

// Volume/mute
volume.addEventListener('input', ()=>{ video.volume = parseFloat(volume.value); video.muted = (video.volume===0); muteBtn.textContent = (video.muted?'🔇':'🔊') })
muteBtn.addEventListener('click', ()=>{ video.muted = !video.muted; if(!video.muted && video.volume===0){ video.volume=0.5; volume.value='0.5' } muteBtn.textContent = (video.muted?'🔇':'🔊') })

// Fullscreen
function toggleFullscreen(){
  if (!document.fullscreenElement){
    (video.requestFullscreen && video.requestFullscreen()) || (player.requestFullscreen && player.requestFullscreen())
  } else {
    (document.exitFullscreen && document.exitFullscreen())
  }
}
fullscreenBtn.addEventListener("click", toggleFullscreen)
document.addEventListener('fullscreenchange', ()=>{
  showControls()
  if (document.fullscreenElement){
    lockLandscapeIfPossible()
  } else {
    unlockOrientationIfPossible()
  }
  updateOrientationUI()
})
window.addEventListener('orientationchange', updateOrientationUI)
window.addEventListener('resize', updateOrientationUI)

// Audio menu toggle
audioBtn.addEventListener('click', (e)=>{
  e.stopPropagation()
  audioMenu.classList.toggle('show')
  showControls()
})
document.addEventListener('click', ()=>{ audioMenu.classList.remove('show'); qualityMenu.classList.remove('show'); speedMenu.classList.remove('show') })

// Quality menu
function buildQualityMenu(){
  qualityMenu.innerHTML = ''
  if (hls && hls.levels && hls.levels.length){
    const auto = document.createElement('div'); auto.className='menu-item'; auto.textContent='Auto'; auto.dataset.level='-1'; qualityMenu.appendChild(auto)
    hls.levels.forEach((lvl, i)=>{
      const label = (lvl.height? (lvl.height+'p') : (Math.round((lvl.bitrate||0)/1000)+'kbps'))
      const el = document.createElement('div'); el.className='menu-item'; el.textContent=label; el.dataset.level=String(i); qualityMenu.appendChild(el)
    })
    const active = hls.currentLevel
    Array.from(qualityMenu.children).forEach((c)=>{ if (parseInt(c.dataset.level)===active) c.classList.add('active'); if(active===-1 && c.dataset.level==='-1') c.classList.add('active') })
  } else {
    const only = document.createElement('div'); only.className='menu-item active'; only.textContent='Auto'; qualityMenu.appendChild(only)
  }
}
qualityBtn.addEventListener('click', (e)=>{ e.stopPropagation(); buildQualityMenu(); qualityMenu.classList.toggle('show'); speedMenu.classList.remove('show'); audioMenu.classList.remove('show'); showControls() })
qualityMenu.addEventListener('click', (e)=>{
  const t = e.target; if(!t || !t.classList || !t.classList.contains('menu-item')) return
  const level = parseInt(t.dataset.level)
  if (hls){ hls.currentLevel = level }
  buildQualityMenu()
})

// Speed menu
const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
function buildSpeedMenu(){
  speedMenu.innerHTML=''
  const current = video.playbackRate
  for (let i=0;i<speeds.length;i++){
    const s = speeds[i]
    const el = document.createElement('div'); el.className='menu-item'+(Math.abs(s-current)<0.001?' active':''); el.textContent = (s+'x'); el.dataset.speed=String(s); speedMenu.appendChild(el)
  }
}
speedBtn.addEventListener('click',(e)=>{ e.stopPropagation(); buildSpeedMenu(); speedMenu.classList.toggle('show'); qualityMenu.classList.remove('show'); audioMenu.classList.remove('show'); showControls() })
speedMenu.addEventListener('click',(e)=>{ const t=e.target; if(!t||!t.classList||!t.classList.contains('menu-item')) return; const s=parseFloat(t.dataset.speed); video.playbackRate=s; localStorage.setItem(storageKey+':speed', String(s)); buildSpeedMenu() })

// PiP
pipBtn.addEventListener('click', async ()=>{
  try {
    if (document.pictureInPictureElement){ await document.exitPictureInPicture() } else if (video.requestPictureInPicture){ await video.requestPictureInPicture() }
  } catch(_e){}
})

// Auto-hide controls like Netflix
function isFullscreenActive(){
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement)
}

function showControls(){
  player.classList.add('show-controls')
  player.classList.remove('hide-cursor')
  if (controlsHideTimer){
    clearTimeout(controlsHideTimer)
    controlsHideTimer = null
  }
  if (isFullscreenActive()){
    return
  }
  controlsHideTimer = setTimeout(()=>{
    // keep controls visible if audio menu is open or when fullscreen toggles mid-timeout
    if (audioMenu.classList.contains('show') || isFullscreenActive()){
      player.classList.add('show-controls')
      player.classList.remove('hide-cursor')
      return
    }
    player.classList.remove('show-controls')
    player.classList.add('hide-cursor')
  }, (window.innerWidth<=768 ? 3000 : 2000))
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

// Spinner & buffering
function showSpinner(){ spinner.style.display='block' }
function hideSpinner(){ spinner.style.display='none' }
video.addEventListener('waiting', showSpinner)
video.addEventListener('stalled', showSpinner)
video.addEventListener('playing', hideSpinner)
video.addEventListener('canplay', hideSpinner)

// Gestures: double-tap seek, dblclick fullscreen
function dblSeek(dir){ video.currentTime = Math.max(0, Math.min(video.duration||Infinity, video.currentTime + (dir*10))) }
function showSeekBadge(dir){
  const el = dir < 0 ? seekBadgeLeft : seekBadgeRight
  if (!el) return
  el.classList.remove('show')
  void el.offsetWidth
  el.classList.add('show')
}
zoneLeft.addEventListener('dblclick', ()=>{ dblSeek(-1); showSeekBadge(-1) })
zoneRight.addEventListener('dblclick', ()=>{ dblSeek(1); showSeekBadge(1) })

// Mobile double-tap detection
let lastTapLeft = 0
let lastTapRight = 0
function handleZoneTap(side){
  const now = Date.now()
  if (side === 'left'){
    if (now - lastTapLeft < 300){ dblSeek(-1); showSeekBadge(-1) }
    lastTapLeft = now
  } else {
    if (now - lastTapRight < 300){ dblSeek(1); showSeekBadge(1) }
    lastTapRight = now
  }
}
zoneLeft.addEventListener('touchstart', ()=> handleZoneTap('left'))
zoneRight.addEventListener('touchstart', ()=> handleZoneTap('right'))
video.addEventListener('dblclick', toggleFullscreen)

// Persistence: volume, speed, position (per TMDB)
const savedVol = parseFloat(localStorage.getItem(storageKey+':volume')||'1')
if (!isNaN(savedVol)){ volume.value=String(savedVol); video.volume=savedVol; video.muted=(savedVol===0); muteBtn.textContent=(video.muted?'🔇':'🔊') }
const savedSpd = parseFloat(localStorage.getItem(storageKey+':speed')||'1')
if (!isNaN(savedSpd)){ video.playbackRate = savedSpd }
const savedPos = parseFloat(localStorage.getItem(storageKey+':time')||'NaN')
if (!isNaN(savedPos)){
  video.addEventListener('loadedmetadata', ()=>{ if (savedPos>0 && savedPos < (video.duration||Infinity)-2){ video.currentTime = savedPos } })
}
setInterval(()=>{ if(!video.seeking && isFinite(video.currentTime)){ localStorage.setItem(storageKey+':time', String(video.currentTime)) } }, 3000)
volume.addEventListener('change', ()=>{ localStorage.setItem(storageKey+':volume', String(video.volume)) })
</script>
</body>
</html>
`
    return new Response(html, { headers: { "Content-Type": "text/html" } })
  } catch(err){
    return new Response(err.toString(), { status: 500 })
  }
}
