let E, v, T;
let __tla = (async () => {
  const g = {}, b = /* @__PURE__ */ new Set([
    "Module",
    "__esModule",
    "default",
    "_export_sfc"
  ]);
  let p = {
    "./config": () => (E([], false, "./config"), y("./__federation_expose_Config-BVd_rKeK.js").then((e) => Object.keys(e).every((o) => b.has(o)) ? () => e.default : () => e))
  };
  let m;
  m = {};
  E = (e, o, a) => {
    const r = import.meta.url;
    if (typeof r > "u") {
      console.warn('The remote style takes effect only when the build.target option in the vite.config.ts file is higher than that of "es2020".');
      return;
    }
    const i = r.substring(0, r.lastIndexOf("remoteEntry.js")), _ = "./";
    "", e.forEach((l) => {
      let n = "";
      const c = _ || i;
      if (c) {
        const s = {
          trailing: (t) => t.endsWith("/") ? t.slice(0, -1) : t,
          leading: (t) => t.startsWith("/") ? t.slice(1) : t
        }, w = (t) => t.startsWith("http") || t.startsWith("//"), d = s.trailing(c), h = s.leading(l), u = s.trailing(i);
        w(c) ? n = [
          d,
          h
        ].filter(Boolean).join("/") : u.includes(d) ? n = [
          u,
          h
        ].filter(Boolean).join("/") : n = [
          u + d,
          h
        ].filter(Boolean).join("/");
      } else n = l;
      if (o) {
        const s = "css__npwd_vicroads__" + a;
        window[s] = window[s] || [], window[s].push(n);
        return;
      }
      if (n in m) return;
      m[n] = true;
      const f = document.createElement("link");
      f.rel = "stylesheet", f.href = n, document.head.appendChild(f);
    });
  };
  async function y(e) {
    return g[e] ?? (g[e] = import(e).then(async (m2) => {
      await m2.__tla;
      return m2;
    })), g[e];
  }
  v = (e) => {
    if (!p[e]) throw new Error("Can not find remote module " + e);
    return p[e]();
  };
  T = (e) => {
    globalThis.__federation_shared__ = globalThis.__federation_shared__ || {}, Object.entries(e).forEach(([o, a]) => {
      for (const [r, i] of Object.entries(a)) {
        const _ = i.scope || "default";
        globalThis.__federation_shared__[_] = globalThis.__federation_shared__[_] || {};
        const l = globalThis.__federation_shared__[_];
        (l[o] = l[o] || {})[r] = i;
      }
    });
  };
})();
export {
  __tla,
  E as dynamicLoadingCss,
  v as get,
  T as init
};
