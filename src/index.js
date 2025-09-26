addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  return await res.text()
}

async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname
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
  </div>
</body>
</html>`
    return new Response(offlineHtml, { status: 403, headers: { 'Content-Type': 'text/html' } })
  }

  if (path === '/manifest.webmanifest') {
    const manifest = {
      name: 'HiroX Stream Player',
      short_name: 'HiroXStream',
      description: 'Stream HiroX content with a mobile-first player experience.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#000000',
      theme_color: '#000000',
      lang: 'en',
      icons: [
        {
          src: 'https://hiroxstream.pages.dev/android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: 'https://hiroxstream.pages.dev/android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    }
    return new Response(JSON.stringify(manifest, null, 2), {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      }
    })
  }

  if (path === '/sw.js') {
    const swScript = `const CACHE_VERSION = 'hiroxstream-shell-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => new Response('You appear to be offline.', {
      headers: { 'Content-Type': 'text/plain' }
    })));
  }
});
`
    return new Response(swScript, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      }
    })
  }

  const tmdbId = url.searchParams.get("tmdb")
  if (!tmdbId) return new Response("Missing ?tmdb= parameter", { status: 400 })

  try {
    const seasonParam = url.searchParams.get("season")
    const episodeParam = url.searchParams.get("episode")
    const contentType = seasonParam && episodeParam ? "series" : "movie"

    if (contentType === "series" && (!seasonParam || !episodeParam)) {
      return new Response("Missing ?season=&episode= parameters for series request", { status: 400 })
    }

    let videoLink = ""
    let title = ""
    let poster = ""
    let streamHeaders = {}
    let streamLanguage = "Default"
    let streamVariants = []

    const kstreamEndpoint = contentType === "series"
      ? `https://kstream.vercel.app/api/content/tv/${tmdbId}/${seasonParam}/${episodeParam}`
      : `https://kstream.vercel.app/api/content/movie/${tmdbId}`

    const nowowEndpoint = contentType === "series"
      ? `https://nowow.xdtohin2.workers.dev/tv/${tmdbId}/${seasonParam}/${episodeParam}`
      : `https://nowow.xdtohin2.workers.dev/movie/${tmdbId}`

    const [kstreamRes, nowowRes] = await Promise.all([
      fetch(kstreamEndpoint, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json"
        }
      }).catch(() => null),
      fetch(nowowEndpoint, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json"
        }
      }).catch(() => null)
    ])

    const parseJsonSafe = async (res) => {
      if (!res) return null
      try {
        return await res.json()
      } catch (_err) {
        return null
      }
    }

    let kstreamData = null
    let nowowData = null

    if (kstreamRes) {
      if (kstreamRes.ok) {
        kstreamData = await parseJsonSafe(kstreamRes)
      } else {
        kstreamData = { streams: [] }
      }
    }

    if (nowowRes) {
      if (nowowRes.ok) {
        nowowData = await parseJsonSafe(nowowRes)
      } else {
        nowowData = { streams: [] }
      }
    }

    const escapeHtml = (value) => {
      if (typeof value !== "string") return ""
      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }
      return value.replace(/[&<>"']/g, (char) => replacements[char] || char)
    }

    const buildVidlinkFallbackResponse = () => {
      const fallbackTitle = kstreamData?.title || nowowData?.title || `TMDB #${tmdbId}`
      const safeTitle = escapeHtml(fallbackTitle)
      const safeTmdbId = encodeURIComponent(tmdbId)
      const seasonSegment = encodeURIComponent(seasonParam || "")
      const episodeSegment = encodeURIComponent(episodeParam || "")
      const fallbackUrl = contentType === "series"
        ? `https://vidfast.pro/tv/${safeTmdbId}/${seasonSegment}/${episodeSegment}`
        : `https://vidfast.pro/movie/${safeTmdbId}`

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
  html, body {
    margin: 0;
    height: 100%;
    background: #000;
    color: #fff;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif;
  }
  #wrapper {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
</head>
<body>
  <div id="wrapper">
    <iframe src="${fallbackUrl}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
  </div>
</body>
</html>`

      return new Response(html, { headers: { "Content-Type": "text/html" } })
    }

    const kstreamStreams = Array.isArray(kstreamData?.streams) ? kstreamData.streams : []
    const nowowStreams = Array.isArray(nowowData?.streams) ? nowowData.streams : []

    const annotatedKstream = kstreamStreams.map((s) => ({ ...s, source: "HiroXStream" }))
    const annotatedNowow = nowowStreams.map((s) => ({ ...s, source: "nowow" }))

    if (!annotatedKstream.length && !annotatedNowow.length) {
      return buildVidlinkFallbackResponse()
    }

    const pickPreferredStream = (streams) => {
      const lower = (value) => (typeof value === "string" ? value.toLowerCase() : "")
      const english = streams.find(s => lower(s.language).includes("english"))
      return english || streams[0]
    }

    const chosenKStream = annotatedKstream.length ? pickPreferredStream(annotatedKstream) : null
    const chosenNowowStream = annotatedNowow.length ? pickPreferredStream(annotatedNowow) : null

    let chosenStream = null
    if (chosenNowowStream && chosenNowowStream.url) {
      chosenStream = chosenNowowStream
    } else if (chosenKStream && chosenKStream.url) {
      chosenStream = chosenKStream
    }

    videoLink = chosenStream?.url || ""
    streamHeaders = chosenStream?.headers || {}
    streamLanguage = chosenStream?.language || "Default"

    const combinedStreams = (() => {
      const order = [...annotatedNowow, ...annotatedKstream]
      const seen = new Set()
      const unique = []
      for (const entry of order) {
        if (!entry || !entry.url) continue
        if (seen.has(entry.url)) continue
        seen.add(entry.url)
        unique.push(entry)
      }
      return unique
    })()

    streamVariants = combinedStreams.map((s, idx) => ({
      id: idx,
      language: s.language || `Stream ${idx + 1}`,
      url: s.url,
      headers: s.headers || {},
      source: s.source || "unknown"
    }))

    title = kstreamData?.title || nowowData?.title || `TMDB #${tmdbId}`
    poster = kstreamData?.poster || kstreamData?.thumbnail || nowowData?.poster || nowowData?.thumbnail || ""

    if (!videoLink) {
      return buildVidlinkFallbackResponse()
    }

    let nextEpisodeHref = ""
    if (
      contentType === "series" &&
      chosenStream?.source === "HiroXStream" &&
      typeof seasonParam === "string" &&
      typeof episodeParam === "string"
    ) {
      const parsedEpisode = parseInt(episodeParam, 10)
      if (!Number.isNaN(parsedEpisode)) {
        const nextEpisodeParams = new URLSearchParams()
        nextEpisodeParams.set("tmdb", tmdbId)
        nextEpisodeParams.set("season", seasonParam)
        nextEpisodeParams.set("episode", String(parsedEpisode + 1))
        nextEpisodeHref = `?${nextEpisodeParams.toString()}`
      }
    }

    let overlayTitle = title
    if (contentType === "series") {
      const seasonLabel = typeof seasonParam === "string" && seasonParam ? `S${seasonParam}` : ""
      const episodeLabel = typeof episodeParam === "string" && episodeParam ? `E${episodeParam}` : ""
      const meta = [seasonLabel, episodeLabel].filter(Boolean).join(" · ")
      overlayTitle = [title, meta].filter(Boolean).join(" • ")
    }

    if (!poster) {
      poster = ""
    }

    if (!title) {
      title = "HiroXStream"
    }

    const storageKeyParts = ["player", contentType, tmdbId]
    if (contentType === "series") {
      storageKeyParts.push(`s${seasonParam || "0"}e${episodeParam || "0"}`)
    }
    const storageKey = storageKeyParts.filter(Boolean).join(":")

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#000000">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>${title}</title>
<style>
html, body { margin:0; height:100%; background:#000; font-family:'Roboto',sans-serif; overflow:hidden; }
#player { width:100%; height:100%; position:relative; cursor:default; }
#player.mobile-fullscreen { position:fixed; inset:0; width:100vw; height:100vh; z-index:9999; background:#000; }
#player.mobile-fullscreen video { object-fit:contain; }
body.mobile-fs-lock { overflow:hidden; touch-action:none; }
video { width:100%; height:100%; object-fit:cover; background:#000; }
#overlay { position:absolute; top:20px; left:20px; color:#fff; font-size:20px; font-weight:bold; text-shadow:2px 2px 5px #000; pointer-events:none; opacity:0; transition:opacity .25s ease; }
#player.show-controls #overlay { opacity:1; }
#player.hide-cursor #overlay { opacity:0; }
#watermark { position:absolute; top:20px; right:20px; padding:6px 12px; font-size:14px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,0.85); background:rgba(0,0,0,0.45); border-radius:6px; pointer-events:none; backdrop-filter:blur(4px); }
#centerPlay { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:64px; color:rgba(255,255,255,0.85); display:flex; align-items:center; justify-content:center; cursor:pointer; pointer-events:auto; }

/* Netflix-like controls */
#controls { position:absolute; left:0; right:0; bottom:0; padding:16px 16px calc(20px + env(safe-area-inset-bottom)); background:linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0)); opacity:0; transform:translateY(10px); transition:opacity .25s ease, transform .25s ease; }
#player.show-controls #controls { opacity:1; transform:translateY(0); }
#player.show-controls .next-episode { opacity:1; transform:translateY(0); }
#player.hide-cursor { cursor:none; }
.next-episode { opacity:0; transform:translateY(10px); }
#player.hide-cursor .next-episode { opacity:0; }
.row { display:flex; align-items:center; gap:10px; color:#fff; }
.btn { background:rgba(255,255,255,0.08); border:none; color:white; cursor:pointer; font-size:18px; padding:8px 12px; border-radius:10px; transition:background .2s ease; }
.btn:hover { background:rgba(255,255,255,0.1); }
.time { font-variant-numeric:tabular-nums; font-size:14px; color:#ddd; }

/* Seek bar */
#seekContainer { position:relative; height:6px; background:rgba(255,255,255,0.25); border-radius:3px; cursor:pointer; margin:8px 0 6px; touch-action:none; }
#seekProgress { position:absolute; top:0; left:0; height:100%; width:0%; background:#e50914; border-radius:3px; }

/* Volume */
#volumeContainer { display:flex; align-items:center; gap:8px; padding:6px 12px; border-radius:999px; background:rgba(0,0,0,0.28); }
#volume { -webkit-appearance:none; appearance:none; width:110px; height:4px; background:#666; border-radius:2px; outline:none; }
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

.next-episode { position:absolute; bottom:100px; right:24px; background:rgba(229,9,20,0.92); color:#fff; border:none; padding:10px 18px; border-radius:999px; font-size:14px; font-weight:600; cursor:pointer; z-index:1000; box-shadow:0 6px 16px rgba(229,9,20,0.35); transition:background 0.2s ease, opacity .25s ease, transform .25s ease; opacity:0; transform:translateY(10px); }
.next-episode:hover { background:rgba(229,9,20,1); }

.next-episode.mobile { bottom:calc(108px + env(safe-area-inset-bottom)); right:16px; }

/* Gesture zones */
#zoneLeft, #zoneRight { position:absolute; top:0; bottom:0; width:35%; cursor:pointer; }
#zoneLeft { left:0; }
#zoneRight { right:0; }

/* Mobile-first tweaks */
@media (max-width: 768px) {
  #controls { padding:20px 12px calc(30px + env(safe-area-inset-bottom)); }
  .controls-bottom { flex-direction:column; align-items:stretch; gap:14px; }
  .desktop-actions { display:none; }
  .main-controls { background:rgba(0,0,0,0.4); border-radius:999px; padding:10px 14px; justify-content:space-between; align-items:center; }
  .round-btn { display:flex; font-size:18px; background:rgba(255,255,255,0.14); }
  .round-btn.active { background:#e50914; }
  #mobilePlayToggle { width:52px; height:52px; font-size:20px; }
  .mobile-actions { display:flex; flex:1; justify-content:flex-end; gap:10px; }
  .time { flex:1; text-align:center; font-size:13px; color:#f5f5f5; }
  #seekContainer { height:6px; margin:4px 0 8px; }
  #volumeContainer { display:none; }
  #audioMenu, #qualityMenu, #speedMenu { position:fixed; left:0; right:0; bottom:0; border-radius:16px 16px 0 0; padding-bottom:calc(18px + env(safe-area-inset-bottom)); margin:0; max-height:50vh; }
  .audio-item, .menu-item { padding:16px 20px; font-size:16px; }
  #zoneLeft, #zoneRight { width:48%; }
}

/* Control layout */
.controls-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.controls-bottom { display:flex; align-items:center; justify-content:space-between; gap:18px; width:100%; }
.main-controls { display:flex; align-items:center; justify-content:flex-start; gap:12px; width:100%; }
.mobile-actions { display:none; align-items:center; gap:10px; }
.desktop-actions { display:flex; align-items:center; gap:12px; }
.round-btn { background:rgba(255,255,255,0.08); border:none; color:white; width:44px; height:44px; border-radius:50%; display:none; align-items:center; justify-content:center; font-size:18px; padding:0; transition:background .2s ease, transform .2s ease; }
.round-btn:hover { background:rgba(255,255,255,0.12); }
.round-btn:active { transform:scale(0.92); }
.left, .right { display:flex; align-items:center; gap:12px; }

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
  <div id="overlay">${overlayTitle}</div>
  <div id="watermark">HiroXStream</div>
  <button id="centerPlay">⏯</button>
  <div id="spinner"></div>
  ${nextEpisodeHref ? `<button id="nextEpisodeBtn" class="next-episode">Next Episode ▶</button>` : ""}
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
      <div class="main-controls">
        <button class="round-btn" id="mobilePlayToggle" aria-label="Play/Pause">▶</button>
        <span class="time" id="timeLabel">00:00 / 00:00</span>
        <div class="mobile-actions">
          <button class="round-btn" id="mobileMute" aria-label="Mute">🔊</button>
          <button class="round-btn" id="mobileAudio" aria-label="Audio tracks">🎵</button>
          <button class="round-btn" id="mobileQuality" aria-label="Quality">HD</button>
          <button class="round-btn" id="mobileSpeed" aria-label="Playback speed">⏱</button>
          <button class="round-btn" id="mobileFullscreen" aria-label="Fullscreen">⛶</button>
        </div>
      </div>
      <div class="desktop-actions">
        <div id="volumeContainer">
          <button class="btn" id="muteBtn" aria-label="Mute" title="Mute">🔊</button>
          <input type="range" id="volume" min="0" max="1" step="0.05" value="1" />
        </div>
        <button class="btn" id="audioBtn" aria-label="Audio tracks" title="Audio tracks">Audio ▾</button>
        <button class="btn" id="qualityBtn" aria-label="Quality" title="Quality">Quality ▾</button>
        <button class="btn" id="speedBtn" aria-label="Playback speed" title="Playback speed">Speed ▾</button>
        <button class="btn" id="pipBtn" aria-label="Picture in picture" title="Picture in picture">PiP</button>
        <button class="btn" id="fullscreen" aria-label="Fullscreen" title="Fullscreen">⛶</button>
      </div>
    </div>
    <div id="audioMenu"></div>
    <div id="qualityMenu"></div>
    <div id="speedMenu"></div>
  </div>
</div>
<script>
const video = document.getElementById("video");
const centerPlay = document.getElementById("centerPlay");
const seekProgress = document.getElementById("seekProgress");
const seekContainer = document.getElementById("seekContainer");
const fullscreenBtn = document.getElementById("fullscreen");
const audioBtn = document.getElementById("audioBtn");
const audioMenu = document.getElementById("audioMenu");
const qualityBtn = document.getElementById("qualityBtn");
const qualityMenu = document.getElementById("qualityMenu");
const speedBtn = document.getElementById("speedBtn");
const speedMenu = document.getElementById("speedMenu");
const pipBtn = document.getElementById("pipBtn");
const spinner = document.getElementById("spinner");
const zoneLeft = document.getElementById("zoneLeft");
const zoneRight = document.getElementById("zoneRight");
const seekBadgeLeft = document.getElementById("seekBadgeLeft");
const seekBadgeRight = document.getElementById("seekBadgeRight");
const rotateOverlay = document.getElementById("rotateOverlay");
const muteBtn = document.getElementById("muteBtn");
const volume = document.getElementById("volume");
const timeLabel = document.getElementById("timeLabel");
const mobilePlayToggle = document.getElementById("mobilePlayToggle");
const mobileMute = document.getElementById("mobileMute");
const mobileAudio = document.getElementById("mobileAudio");
const mobileQuality = document.getElementById("mobileQuality");
const mobileSpeed = document.getElementById("mobileSpeed");
const mobileFullscreen = document.getElementById("mobileFullscreen");
const player = document.getElementById("player");
const body = document.body;
const initialStreamHeaders = ${JSON.stringify(streamHeaders)};
const streamVariants = ${JSON.stringify(streamVariants)};
const streamLanguage = ${JSON.stringify(streamLanguage)};
const storageKey = ${JSON.stringify(storageKey)};
const initialStreamUrl = ${JSON.stringify(videoLink)};
const nextEpisodeUrl = ${JSON.stringify(nextEpisodeHref)};
const nextEpisodeBtn = document.getElementById("nextEpisodeBtn");

let currentStreamHeaders = initialStreamHeaders || {};
let currentStreamUrl = initialStreamUrl;
let activeStreamIndex = -1;
let resumeAfterPortrait = false;
let orientationForcedPause = false;

if (Array.isArray(streamVariants) && streamVariants.length){
  let savedVariantIndex = -1;
  try {
    const raw = localStorage.getItem(storageKey + ':variant');
    if (raw !== null){
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed) && streamVariants[parsed]){
        savedVariantIndex = parsed;
      }
    }
  } catch(_e){}

  if (savedVariantIndex >= 0){
    activeStreamIndex = savedVariantIndex;
  } else {
    activeStreamIndex = streamVariants.findIndex(v => v && v.url === initialStreamUrl);
    if (activeStreamIndex < 0) activeStreamIndex = 0;
  }

  const selectedVariant = streamVariants[activeStreamIndex];
  if (selectedVariant && selectedVariant.url){
    currentStreamUrl = selectedVariant.url;
  }
  if (selectedVariant && selectedVariant.headers){
    currentStreamHeaders = selectedVariant.headers;
  }

  buildCustomStreamMenu();
}

// Ensure inline playback on mobile browsers and keep custom controls active
video.setAttribute('playsinline', 'true');
video.setAttribute('webkit-playsinline', 'true');
video.setAttribute('x5-playsinline', 'true');
video.playsInline = true;
video.controls = false;

let hls = null;
let audioSelect = null;
let controlsHideTimer = null;

// Mobile landscape helper
function isMobileCoarse(){
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches){
      return true
    }
  } catch(_e){}
  const maxTouch = Number(navigator.maxTouchPoints || navigator.msMaxTouchPoints || 0)
  if (maxTouch > 1){
    return true
  }
  const ua = (navigator.userAgent || navigator.vendor || '').toLowerCase()
  if (/iphone|ipad|ipod|android|mobile|mobi|silk|kindle|blackberry|bb10/.test(ua)){
    return true
  }
  return false
}
async function lockLandscapeIfPossible(){
  if (!isMobileCoarse()) return
  try {
    if (screen.orientation && screen.orientation.lock){ await screen.orientation.lock('landscape') }
  } catch(_e){}
}
function unlockOrientationIfPossible(){
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock() } catch(_e){}
}

function updateOrientationUI(){
  if (!isMobileCoarse()) return
  const isFs = isFullscreenActive()
  const isPortrait = window.innerHeight > window.innerWidth
  const shouldBlock = isFs && isPortrait
  rotateOverlay.style.display = shouldBlock ? 'flex' : 'none'
  if (shouldBlock){
    if (!video.paused){ video.pause() }
  } else {
    if (mobilePlayToggle && mobilePlayToggle.classList.contains('active') && video.paused){
      video.play().catch(()=>{})
    }
  }
}

function renderAudioMenu(items, activeIndex){
  audioMenu.innerHTML = '';
  for (let i = 0; i < items.length; i++){
    const div = document.createElement('div');
    div.className = 'audio-item' + (i === activeIndex ? ' active' : '');
    div.dataset.index = String(i);
    const primary = '<strong>' + items[i].label + '</strong>';
    const meta = items[i].meta ? '<div style="font-size:12px;color:#888;">' + items[i].meta + '</div>' : '';
    div.innerHTML = primary + meta;
    audioMenu.appendChild(div);
  }
}

function buildCustomStreamMenu(){
  if (!Array.isArray(streamVariants) || !streamVariants.length){
    audioMenu.innerHTML = '<div class="audio-item active">Default</div>';
    return;
  }
  const items = streamVariants.map((variant) => ({
    label: variant.language || 'Variant',
    meta: variant.source ? ('Source: ' + variant.source) : ''
  }));
  let highlightIndex = activeStreamIndex;
  if (highlightIndex < 0) highlightIndex = 0;
  if (highlightIndex >= items.length) highlightIndex = items.length - 1;
  renderAudioMenu(items, highlightIndex);
}

function buildAudioListFromHls(){
  if (Array.isArray(streamVariants) && streamVariants.length){
    buildCustomStreamMenu();
    return;
  }
  const labels = [];
  let selectedIndex = -1;
  hls.audioTracks.forEach((track, index) => {
    const label = (track.name || track.lang || ('Track ' + (index+1))) + (track.lang && (track.name||'') !== track.lang ? ' ('+track.lang+')' : '');
    labels.push({ label, meta: '' });
    if (track.default) selectedIndex = index;
  });
  if (selectedIndex === -1) selectedIndex = hls.audioTrack || 0;
  renderAudioMenu(labels, selectedIndex);
}

function buildAudioListFromNative(){
  if (Array.isArray(streamVariants) && streamVariants.length){
    buildCustomStreamMenu();
    return;
  }
  const aTracks = video.audioTracks || [];
  const items = [];
  let active = 0;
  for (let i = 0; i < aTracks.length; i++){
    const t = aTracks[i];
    const label = (t.label || t.language || ('Track ' + (i+1))) + (t.language && (t.label||'') !== t.language ? ' ('+t.language+')' : '');
    items.push({ label, meta: '' });
    if (t.enabled) active = i;
  }
  renderAudioMenu(items, active);
}

function switchStreamVariant(index){
  if (!Array.isArray(streamVariants) || !streamVariants[index]) return
  const variant = streamVariants[index];
  activeStreamIndex = index;
  currentStreamUrl = variant.url || currentStreamUrl;
  currentStreamHeaders = variant.headers || {};
  try { localStorage.setItem(storageKey + ':variant', String(index)) } catch(_e){}
  showSpinner();
  const resumeAfter = !video.paused;
  if (hls){
    hls.loadSource(currentStreamUrl || initialStreamUrl);
    if (hls.media !== video){
      hls.attachMedia(video);
    }
    if (resumeAfter){
      const onParsed = () => {
        video.play().catch(()=>{});
        hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
      };
      hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
    }
  } else {
    const startPlayback = resumeAfter;
    video.src = currentStreamUrl || initialStreamUrl;
    if (startPlayback){ video.play().catch(()=>{}); }
  }
  buildCustomStreamMenu();
  audioMenu.classList.remove('show');
}

function initPlayer(){
  if (window.Hls && Hls.isSupported()){
    hls = new Hls({
      enableWorker: true,
      capLevelToPlayerSize: false,
      startLevel: -1,
      maxBufferLength: 30,
      maxLiveSyncPlaybackRate: 1.5,
      liveDurationInfinity: true,
      // Keep video rendition stable when switching audio by not forcing auto right after
      xhrSetup: function(xhr){
        xhr.withCredentials = false
        const headers = currentStreamHeaders || {}
        if (headers){
          Object.keys(headers).forEach(key => {
            const value = headers[key]
            if (value){ xhr.setRequestHeader(key, value) }
          })
        }
      }
    })
hls.loadSource(currentStreamUrl || initialStreamUrl)
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
      const item = e.target && e.target.closest ? e.target.closest('.audio-item') : null
      if (!item) return
      const id = parseInt(item.dataset.index, 10)
      if (Array.isArray(streamVariants) && streamVariants.length){
        switchStreamVariant(id)
        return
      }
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
    video.src = currentStreamUrl || initialStreamUrl
    video.addEventListener('loadedmetadata', () => {
      buildAudioListFromNative()
    })
    audioMenu.addEventListener('click', (e) => {
      const item = e.target && e.target.closest ? e.target.closest('.audio-item') : null
      if (!item) return
      const idx = parseInt(item.dataset.index, 10)
      if (Array.isArray(streamVariants) && streamVariants.length){
        switchStreamVariant(idx)
        return
      }
      const aTracks = video.audioTracks || []
      for (let i = 0; i < aTracks.length; i++){
        aTracks[i].enabled = (i === idx)
      }
      buildAudioListFromNative()
      if (video.paused === false){ video.play().catch(()=>{}) }
    })
  } else {
    // Fallback: try setting src anyway
    video.src = currentStreamUrl || initialStreamUrl
  }
}

initPlayer()

// Center play toggle
function togglePlay(){
  if(video.paused){
    const playPromise = video.play()
    if (playPromise && typeof playPromise.then === 'function'){
      playPromise.catch((err)=>{
        console.debug('Video play blocked', err)
        showControls()
        centerPlay.style.display='flex'
        if (mobilePlayToggle){
          mobilePlayToggle.textContent = '▶'
          mobilePlayToggle.classList.remove('active')
        }
      })
    }
  } else {
    video.pause();
  }
}
centerPlay.addEventListener("click", togglePlay)
video.addEventListener("click", togglePlay)
video.addEventListener("play", ()=>{
  centerPlay.style.display='none'
  if (mobilePlayToggle){
    mobilePlayToggle.textContent = '⏸'
    mobilePlayToggle.classList.add('active')
  }
  requestWakeLock().catch(()=>{})
})
video.addEventListener("pause", ()=>{
  centerPlay.style.display='flex'
  if (mobilePlayToggle){
    mobilePlayToggle.textContent = '▶'
    mobilePlayToggle.classList.remove('active')
  }
  releaseWakeLock().catch(()=>{})
})
// Attempt to lock to landscape on mobile when playback starts
video.addEventListener('play', ()=>{ lockLandscapeIfPossible(); ensureMobileLandscape() })

if (mobilePlayToggle){
  const mobilePlayHandler = (e)=>{
    e.preventDefault()
    e.stopPropagation()
    togglePlay()
    showControls()
  }
  mobilePlayToggle.addEventListener('click', mobilePlayHandler, { passive: false })
}

// Time/seek bar
function fmtTime(t){ if(!isFinite(t)) return '00:00'; const h=Math.floor(t/3600); const m=Math.floor((t%3600)/60); const s=Math.floor(t%60); return (h>0?(h+':'):'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0') }
function updateTime(){
  const percent = video.duration ? (video.currentTime / video.duration) * 100 : 0
  seekProgress.style.width = (percent)+"%"
  timeLabel.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration)
}
video.addEventListener('timeupdate', updateTime)
video.addEventListener('loadedmetadata', updateTime)
video.addEventListener('loadedmetadata', ()=>{
  setTimeout(()=>{
    const autoplayAttempt = video.play()
    if (autoplayAttempt && typeof autoplayAttempt.then === 'function'){
      autoplayAttempt.then(()=>{
        showControls()
        requestWakeLock().catch(()=>{})
      }).catch((err)=>{
        console.debug('Autoplay failed', err)
        showControls()
      })
    }
  }, 150)
})
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
function syncMuteIcons(){
  const icon = (video.muted ? '🔇' : '🔊')
  muteBtn.textContent = icon
  if (mobileMute){ mobileMute.textContent = icon }
}
volume.addEventListener('input', ()=>{
  video.volume = parseFloat(volume.value);
  video.muted = (video.volume===0);
  if (video.volume > 0 && video.muted){ video.muted = false }
  syncMuteIcons()
})
muteBtn.addEventListener('click', ()=>{
  video.muted = !video.muted;
  if (!video.muted && video.volume===0){ video.volume=0.5; volume.value='0.5' }
  syncMuteIcons()
})
if (mobileMute){
  mobileMute.addEventListener('click', ()=>{
    video.muted = !video.muted;
    if (!video.muted && video.volume===0){ video.volume=0.5; volume.value='0.5' }
    syncMuteIcons()
  })
}

if (mobileAudio){
  mobileAudio.addEventListener('click', (e)=>{
    e.stopPropagation();
    audioMenu.classList.toggle('show');
    qualityMenu.classList.remove('show');
    speedMenu.classList.remove('show');
    showControls();
  })
}
if (mobileQuality){
  mobileQuality.addEventListener('click', (e)=>{
    e.stopPropagation();
    buildQualityMenu();
    qualityMenu.classList.toggle('show');
    audioMenu.classList.remove('show');
    speedMenu.classList.remove('show');
    showControls();
  })
}
if (mobileSpeed){
  mobileSpeed.addEventListener('click', (e)=>{
    e.stopPropagation();
    buildSpeedMenu();
    speedMenu.classList.toggle('show');
    audioMenu.classList.remove('show');
    qualityMenu.classList.remove('show');
    showControls();
  })
}
if (mobileFullscreen){ mobileFullscreen.addEventListener('click', toggleFullscreen) }


// Fullscreen
function requestFullscreenElement(el){
  if (!el) return Promise.reject(new Error('No element to fullscreen'))
  if (el.requestFullscreen) return el.requestFullscreen()
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen()
  if (el.msRequestFullscreen) return el.msRequestFullscreen()
  return Promise.reject(new Error('Fullscreen API not available'))
}

function exitFullscreen(){
  if (document.exitFullscreen) return document.exitFullscreen()
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen()
  if (document.msExitFullscreen) return document.msExitFullscreen()
  return Promise.resolve()
}

function enterMobilePseudoFullscreen(){
  player.classList.add('mobile-fullscreen')
  body.classList.add('mobile-fs-lock')
  video.controls = false
  lockLandscapeIfPossible()
  showControls()
  updateOrientationUI()
}

function exitMobilePseudoFullscreen(){
  player.classList.remove('mobile-fullscreen')
  body.classList.remove('mobile-fs-lock')
  unlockOrientationIfPossible()
  showControls()
  updateOrientationUI()
}

function ensureMobileLandscape(){
  if (!isMobileCoarse()) return
  const nativeFs = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement
  if (nativeFs) return
  if (!player.classList.contains('mobile-fullscreen')){
    enterMobilePseudoFullscreen()
  }
}

async function toggleFullscreen(){
  if (isMobileCoarse()){
    const nativeFs = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement
    const pseudoFs = player.classList.contains('mobile-fullscreen')
    if (!nativeFs && !pseudoFs){
      let nativeSucceeded = false
      try {
        await requestFullscreenElement(player)
        nativeSucceeded = true
      } catch(_err){
        try {
          await requestFullscreenElement(video)
          nativeSucceeded = true
        } catch(_err2){}
      }
      if (nativeSucceeded){
        lockLandscapeIfPossible()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        enterMobilePseudoFullscreen()
        window.scrollTo({ top: 0, behavior: 'smooth' })
        showControls()
      }
      updateOrientationUI()
    } else {
      await exitFullscreen().catch(()=>{})
      exitMobilePseudoFullscreen()
    }
    return
  }

  if (!isFullscreenActive()){
    try {
      await requestFullscreenElement(player)
    } catch (_err){
      await requestFullscreenElement(video).catch(()=>{})
    }
  } else {
    await exitFullscreen()
  }
}
fullscreenBtn.addEventListener("click", toggleFullscreen)

function onFullscreenChange(){
  showControls()
  if (isFullscreenActive()){
    lockLandscapeIfPossible()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    unlockOrientationIfPossible()
    exitMobilePseudoFullscreen()
  }
  video.controls = false
  updateOrientationUI()
}

document.addEventListener('fullscreenchange', onFullscreenChange)
document.addEventListener('webkitfullscreenchange', onFullscreenChange)
document.addEventListener('msfullscreenchange', onFullscreenChange)
video.addEventListener('webkitendfullscreen', ()=>{
  video.controls = false
  exitMobilePseudoFullscreen()
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
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement || player.classList.contains('mobile-fullscreen'))
}

function showControls(){
  player.classList.add('show-controls')
  player.classList.remove('hide-cursor')
  if (controlsHideTimer){
    clearTimeout(controlsHideTimer)
    controlsHideTimer = null
  }
  const autoHideDelay = 3000
  controlsHideTimer = setTimeout(() => {
    // keep controls visible if audio menu is open or when fullscreen toggles mid-timeout
    if (audioMenu.classList.contains('show') || video.paused){
      player.classList.add('show-controls')
      player.classList.remove('hide-cursor')
      return
    }
    player.classList.remove('show-controls')
    player.classList.add('hide-cursor')
  }, autoHideDelay)
}

;['mousemove','pointermove','touchstart','touchmove'].forEach(evt => {
  player.addEventListener(evt, () => {
    showControls()
  }, { passive: true })
})
document.addEventListener('keydown', (e)=>{
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return
  showControls()
  if (e.code === 'Space'){ e.preventDefault(); togglePlay() }
  if (e.key === 'ArrowLeft'){ video.currentTime=Math.max(0,video.currentTime-10) }
  if (e.key === 'ArrowRight'){ video.currentTime=Math.min(video.duration,video.currentTime+10) }
  if (e.key === 'f' || e.key === 'F'){ toggleFullscreen() }
  if (e.key === 'm' || e.key === 'M'){ video.muted=!video.muted; muteBtn.textContent = (video.muted?'🔇':'🔊') }
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !video.paused){
    requestWakeLock().catch(()=>{})
  } else {
    releaseWakeLock().catch(()=>{})
  }
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
