addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const target = url.searchParams.get('url')

  if (!target) {
    return new Response('Missing ?url= parameter', { status: 400 })
  }

  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Cloudflare Worker HLS Proxy)'
      }
    })
    const body = await res.arrayBuffer()
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
      }
    })
  } catch (err) {
    return new Response(err.toString(), { status: 500 })
  }
}
