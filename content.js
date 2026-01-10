(() => {
  const ext = (typeof browser !== "undefined") ? browser : chrome;

  let last = {
    srcUrl: "",
    pageUrl: location.href,
    dataUrl: "",
    suggestedName: "",
    width: 0,
    height: 0
  };

  function isImg(el) {
    return el && el.tagName && el.tagName.toLowerCase() === "img";
  }

  function guessBigEnough(img) {
    try {
      const r = img.getBoundingClientRect();
      return (r.width >= 80 && r.height >= 80);
    } catch {
      return true;
    }
  }

  function scoreImg(img) {
    let score = 0;
    try {
      const r = img.getBoundingClientRect();
      score += Math.min(2000, Math.floor(r.width * r.height / 50));
    } catch {}

    const src = img.currentSrc || img.src || "";
    const srcset = img.getAttribute("srcset") || "";

    if (src) score += 200;
    if (src.startsWith("http")) score += 150;
    if (srcset) score += 250;

    return score;
  }

  function findBestImgFromNode(start) {
    if (!start) return null;

    if (isImg(start) && guessBigEnough(start)) return start;

    let node = start;
    for (let depth = 0; depth < 10 && node; depth++) {
      if (isImg(node) && guessBigEnough(node)) return node;

      const imgs = node.querySelectorAll ? Array.from(node.querySelectorAll("img")) : [];
      if (imgs.length) {
        let best = null;
        let bestScore = -Infinity;
        for (const img of imgs) {
          if (!guessBigEnough(img)) continue;
          const s = scoreImg(img);
          if (s > bestScore) {
            bestScore = s;
            best = img;
          }
        }
        if (best) return best;
      }

      node = node.parentElement;
    }

    return null;
  }

  function parseSrcset(srcset) {
    // returns array of {url, w}
    const out = [];
    if (!srcset || typeof srcset !== "string") return out;

    for (const part of srcset.split(",")) {
      const s = part.trim();
      if (!s) continue;

      const bits = s.split(/\s+/).filter(Boolean);
      const url = bits[0];
      let w = 0;

      const last = bits[bits.length - 1] || "";
      const m = /(\d+)w$/.exec(last);
      if (m) w = Number(m[1]) || 0;

      if (url) out.push({ url, w });
    }
    return out;
  }

  function pickLargestSrcsetUrl(img) {
    try {
      const srcset = img.getAttribute("srcset") || "";
      const candidates = parseSrcset(srcset);
      if (!candidates.length) return "";

      candidates.sort((a, b) => (b.w || 0) - (a.w || 0));
      return candidates[0].url || "";
    } catch {
      return "";
    }
  }

  /**
   * ✅ GLOBAL "upgrade URL" heuristic:
   * tries to remove known downscale params and promote "name=orig" if present.
   * (works for Twitter, also helps tons of CDNs generically)
   */
  function upgradeImageUrl(url) {
    if (!url || typeof url !== "string") return url;

    // don't touch blobs/data
    if (url.startsWith("blob:") || url.startsWith("data:")) return url;

    try {
      const u = new URL(url, location.href);

      // Some CDNs use explicit width/height query params → remove
      for (const k of ["w", "h", "width", "height", "maxw", "maxh"]) {
        if (u.searchParams.has(k)) u.searchParams.delete(k);
      }

      // twitter-like + other CDNs use name=size
      // We do this GENERICALLY: if a "name" param exists, prefer orig.
      // (If the server doesn't support it, it will just ignore/fallback.)
      if (u.searchParams.has("name")) {
        u.searchParams.set("name", "orig");
      }

      // quality params can force compression; remove if present
      for (const k of ["q", "quality", "jpeg_quality", "webp_quality"]) {
        if (u.searchParams.has(k)) u.searchParams.delete(k);
      }

      // Some CDNs use "size=small|large"; remove so CDN picks default best
      if (u.searchParams.has("size")) {
        u.searchParams.delete("size");
      }

      return u.toString();
    } catch {
      return url;
    }
  }

  function getSrcFromImg(img) {
    if (!img) return "";

    // Prefer largest srcset candidate, then upgrade URL
    const largestSrcset = pickLargestSrcsetUrl(img);
    if (largestSrcset) return upgradeImageUrl(largestSrcset);

    const raw = img.currentSrc || img.src || "";
    return upgradeImageUrl(raw);
  }

  function getDimsFromImg(img) {
    if (!img) return { width: 0, height: 0 };

    const nw = Number(img.naturalWidth || 0);
    const nh = Number(img.naturalHeight || 0);
    if (nw > 0 && nh > 0) return { width: nw, height: nh };

    try {
      const r = img.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    } catch {
      return { width: 0, height: 0 };
    }
  }

  function sendLastImage() {
    if (!last.srcUrl) return;
    try {
      ext.runtime.sendMessage({
        type: "LAST_IMAGE",
        srcUrl: last.srcUrl,
        pageUrl: last.pageUrl,
        width: last.width,
        height: last.height
      });
    } catch {}
  }

  function captureFromEvent(e) {
    try {
      const x = e.clientX;
      const y = e.clientY;

      let hit = null;
      try { hit = document.elementFromPoint(x, y); } catch {}

      const img = findBestImgFromNode(hit || e.target);
      const srcUrl = getSrcFromImg(img);
      if (!srcUrl) return;

      const { width, height } = getDimsFromImg(img);

      last = {
        srcUrl,
        pageUrl: location.href,
        dataUrl: "",
        suggestedName: "",
        width,
        height
      };

      sendLastImage();
    } catch {}
  }

  document.addEventListener("mousedown", (e) => {
    if (e.button !== 2) return;
    captureFromEvent(e);
  }, { capture: false });

  document.addEventListener("contextmenu", (e) => {
    captureFromEvent(e);
  }, { capture: false });

  ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "GET_LAST_IMAGE_DATA_URL") return;

    sendResponse({
      ok: true,
      dataUrl: last.dataUrl || "",
      suggestedName: last.suggestedName || ""
    });
  });
})();

