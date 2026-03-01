(async () => {
  const E = function() {
    const r = typeof document < "u" && document.createElement("link").relList;
    return r && r.supports && r.supports("modulepreload") ? "modulepreload" : "preload";
  }(), v = function(l, r) {
    return new URL(l, r).href;
  }, h = {}, y = function(r, a, u) {
    let d = Promise.resolve();
    if (a && a.length > 0) {
      const o = document.getElementsByTagName("link"), e = document.querySelector("meta[property=csp-nonce]"), m = e?.nonce || e?.getAttribute("nonce");
      d = Promise.allSettled(a.map((t) => {
        if (t = v(t, u), t in h) return;
        h[t] = true;
        const s = t.endsWith(".css"), p = s ? '[rel="stylesheet"]' : "";
        if (!!u) for (let c = o.length - 1; c >= 0; c--) {
          const i = o[c];
          if (i.href === t && (!s || i.rel === "stylesheet")) return;
        }
        else if (document.querySelector(`link[href="${t}"]${p}`)) return;
        const n = document.createElement("link");
        if (n.rel = s ? "stylesheet" : E, s || (n.as = "script"), n.crossOrigin = "", n.href = t, m && n.setAttribute("nonce", m), document.head.appendChild(n), s) return new Promise((c, i) => {
          n.addEventListener("load", c), n.addEventListener("error", () => i(new Error(`Unable to preload CSS for ${t}`)));
        });
      }));
    }
    function f(o) {
      const e = new Event("vite:preloadError", {
        cancelable: true
      });
      if (e.payload = o, window.dispatchEvent(e), !e.defaultPrevented) throw o;
    }
    return d.then((o) => {
      for (const e of o || []) e.status === "rejected" && f(e.reason);
      return r().catch(f);
    });
  };
  y(() => import("./index-CUC8FiB1.js").then(async (m) => {
    await m.__tla;
    return m;
  }), [], import.meta.url);
})();
