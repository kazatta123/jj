// proxy.js
const http = require("http");
const https = require("https");
const url = require("url");

const PORT = process.env.PORT || 9999;

const SPOOF = {
  "Referer":        "https://tyhh.net/",
  "Origin":         "https://tyhh.net",
  "User-Agent":     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept":         "*/*",
  "Accept-Language":"vi-VN,vi;q=0.9,en;q=0.8",
  "Accept-Encoding":"identity",
  "Cache-Control":  "no-cache",
};

function fetch(targetUrl) {
  return new Promise((resolve, reject) => {
    const u = new url.URL(targetUrl);
    const opts = {
      hostname: u.hostname,
      port:     u.port || (u.protocol === "https:" ? 443 : 80),
      path:     u.pathname + u.search,
      method:   "GET",
      headers:  { ...SPOOF, "Host": u.hostname },
    };
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(opts, resolve);
    req.on("error", reject);
    req.end();
  });
}

function proxyUrl(u) {
  return `/proxy?url=${encodeURIComponent(u)}`;
}

function rewriteM3U8(text, baseUrl) {
  const base = new url.URL(baseUrl);
  return text.split("\n").map(line => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return line;
    const abs = t.startsWith("http") ? t : new url.URL(t, base).href;
    return proxyUrl(abs);
  }).join("\n");
}

http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");

  const p = url.parse(req.url, true);
  if (p.pathname === "/") {
    res.writeHead(200);
    res.end("OK");
    return;
  }

  if (p.pathname !== "/proxy") {
    res.writeHead(404);
    res.end();
    return;
  }

  const target = p.query.url;
  if (!target) {
    res.writeHead(400);
    res.end("Missing url");
    return;
  }

  try {
    const up = await fetch(target);
    const ct = up.headers["content-type"] || "";
    const isM3U8 = target.includes(".m3u8") || ct.includes("mpegurl");

    if (up.statusCode !== 200) {
      res.writeHead(up.statusCode);
      up.pipe(res);
      return;
    }

    if (isM3U8) {
      let body = "";
      up.setEncoding("utf8");
      up.on("data", c => body += c);
      up.on("end", () => {
        const out = rewriteM3U8(body, target);
        res.writeHead(200, {
          "Content-Type": "application/vnd.apple.mpegurl"
        });
        res.end(out);
      });
    } else {
      res.writeHead(200, {
        "Content-Type": ct || "video/mp2t"
      });
      up.pipe(res);
    }

  } catch(e) {
    res.writeHead(500);
    res.end("Error: " + e.message);
  }

}).listen(PORT, () => console.log("Proxy running on " + PORT));
