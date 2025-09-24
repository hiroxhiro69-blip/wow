addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const tmdbId = url.searchParams.get('tmdb')

  if (!tmdbId) {
    return new Response('Missing ?tmdb= parameter', { status: 400 })
  }

  try {
    // Fetch the uEmbed JSON
    const res = await fetch(`https://uembed.xyz/api/videos/tmdb?id=${tmdbId}`)
    const data = await res.json()

    if (!data || data.length === 0 || !data[0].file) {
      return new Response('No streaming link found for this TMDB ID', { status: 404 })
    }

    const streamUrl = data[0].file

    // Serve HTML player directly
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data[0].title}</title>
  <link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css" />
  <style>
    body { margin:0; background:black; display:flex; justify-content:center; align-items:center; height:100vh; flex-direction:column; }
    #player { width:90%; max-width:1000px; border-radius:10px; box-shadow:0 0 20px rgba(0,0,0,0.7); background:black; }
    select { margin:10px; padding:5px 10px; border-radius:5px; }
  </style>
</head>
<body>
  <video id="player" controls autoplay></video>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <script src="https://cdn.plyr.io/3.7.8/plyr.polyfilled.js"></script>
  <script>
    const streamUrl = "${streamUrl}";
    const video = document.getElementById('player');

    if(Hls.isSupported()){
      const hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const tracks = hls.audioTracks;
        if(tracks && tracks.length > 1){
          const select = document.createElement('select');
          tracks.forEach((t,i)=>{
            const opt = document.createElement('option');
            opt.value = i;
            opt.text = t.name || "Audio " + i;
            select.appendChild(opt);
          });
          select.addEventListener('change', ()=>{ hls.audioTrack = select.value; });
          document.body.insertBefore(select, video.nextSibling);
        }
      });
    }

    const player = new Plyr(video, { controls: ['play','progress','volume','fullscreen','settings'], autoplay:true });
  </script>
</body>
</html>
`
    return new Response(html, { headers: { 'Content-Type': 'text/html' } })
  } catch (err) {
    return new Response(err.toString(), { status: 500 })
  }
}
