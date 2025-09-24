addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");

    if (!target) {
      return new Response("Missing `url` parameter", { status: 400 });
    }

    // Fetch the original HLS file
    const res = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0" } // optional headers
    });

    // Clone response to modify headers
    const newHeaders = new Headers(res.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*"); // CORS
    newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    newHeaders.set("Access-Control-Allow-Headers", "Content-Type");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders
    });
  } catch (err) {
    return new Response(err.toString(), { status: 500 });
  }
}
