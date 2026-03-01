import { importShared as W, __tla as __tla_0 } from "./__federation_fn_import-C_7gNWqI.js";
import { r as V } from "./index-CtmpQeow.js";
let fe, t, K;
let __tla = Promise.all([
  (() => {
    try {
      return __tla_0;
    } catch {
    }
  })()
]).then(async () => {
  var z = {
    exports: {}
  }, w = {};
  var q = V, G = Symbol.for("react.element"), M = Symbol.for("react.fragment"), H = Object.prototype.hasOwnProperty, J = q.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, Y = {
    key: true,
    ref: true,
    __self: true,
    __source: true
  };
  function I(e, r, i) {
    var o, n = {}, u = null, d = null;
    i !== void 0 && (u = "" + i), r.key !== void 0 && (u = "" + r.key), r.ref !== void 0 && (d = r.ref);
    for (o in r) H.call(r, o) && !Y.hasOwnProperty(o) && (n[o] = r[o]);
    if (e && e.defaultProps) for (o in r = e.defaultProps, r) n[o] === void 0 && (n[o] = r[o]);
    return {
      $$typeof: G,
      type: e,
      key: u,
      ref: d,
      props: n,
      _owner: J.current
    };
  }
  w.Fragment = M;
  w.jsx = I;
  w.jsxs = I;
  z.exports = w;
  t = z.exports;
  let Z;
  K = "" + new URL("FinesVicLogo-CZ7ggJBL.jpg", import.meta.url).href;
  Z = [
    "cad_bridge",
    "fivem-resource",
    "fivem_resource"
  ];
  function Q(e) {
    const r = String(e || "").trim();
    return !r || !/^[a-z0-9_-]+$/i.test(r) ? "" : r;
  }
  function X(e) {
    const r = [], i = /* @__PURE__ */ new Set();
    for (const o of Array.isArray(e) ? e : []) {
      const n = Q(o);
      !n || i.has(n) || (i.add(n), r.push(n));
    }
    return r;
  }
  function ee() {
    const e = [];
    if (typeof window < "u") {
      const r = [
        window.CAD_BRIDGE_RESOURCE,
        window.cadBridgeResource,
        window.__CAD_BRIDGE_RESOURCE__,
        window.__cadBridgeResource__
      ];
      Array.isArray(window.CAD_BRIDGE_RESOURCES) && r.push(...window.CAD_BRIDGE_RESOURCES), Array.isArray(window.__CAD_BRIDGE_RESOURCES__) && r.push(...window.__CAD_BRIDGE_RESOURCES__);
      try {
        const i = new URLSearchParams(String(window.location?.search || ""));
        r.push(i.get("cadBridgeResource")), r.push(i.get("cad_bridge_resource"));
      } catch {
      }
      try {
        r.push(window.localStorage?.getItem("cad_bridge_resource"));
      } catch {
      }
      e.push(...r);
    }
    return e.push(...Z), X(e);
  }
  function re() {
    const e = ee(), r = [];
    for (const i of e) r.push(`https://cfx-nui-${i}`), r.push(`https://${i}`);
    return r;
  }
  function te(e) {
    return !!e && typeof e == "object" && !Array.isArray(e) && Object.keys(e).length === 0;
  }
  function ne(e) {
    return !e || typeof e != "object" || Array.isArray(e) ? false : "ok" in e || "success" in e || "error" in e || "message" in e || "payload" in e || "notice" in e || "notices" in e || "summary" in e;
  }
  function ie(e) {
    if (e && typeof e == "object" && !Array.isArray(e)) return e;
    if (e === false) return {
      ok: false,
      error: "callback_failed",
      message: "CAD bridge callback returned false."
    };
    const r = String(e || "").trim();
    return r ? {
      ok: false,
      error: "invalid_payload",
      message: r
    } : {
      ok: false,
      error: "invalid_payload",
      message: "CAD bridge returned an empty payload."
    };
  }
  function oe(e) {
    const r = Math.max(1e3, Number(e) || 1e4);
    if (typeof AbortController > "u") return {
      signal: void 0,
      cancel: () => {
      },
      timeout: r
    };
    const i = new AbortController(), o = setTimeout(() => i.abort(new Error("Request timed out")), r);
    return {
      signal: i.signal,
      timeout: r,
      cancel: () => clearTimeout(o)
    };
  }
  async function ae(e, r, i) {
    const o = oe(i);
    try {
      const n = fetch(e, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8"
        },
        cache: "no-store",
        credentials: "omit",
        signal: o.signal,
        body: JSON.stringify(r || {})
      }), u = new Promise((S, y) => {
        setTimeout(() => y(new Error("CAD bridge request timed out")), o.timeout || Math.max(1e3, Number(i) || 1e4));
      }), d = await Promise.race([
        n,
        u
      ]), l = await d.text();
      let c = null;
      try {
        c = JSON.parse(l || "{}");
      } catch {
        c = null;
      }
      return d.ok ? c || {
        ok: false,
        error: "invalid_json",
        message: l || "Invalid response from CAD bridge"
      } : c || {
        ok: false,
        error: "http_error",
        status: d.status,
        message: l || `CAD bridge request failed (${d.status})`
      };
    } catch (n) {
      const u = String(n?.name || "").toLowerCase() === "aborterror";
      throw new Error(u ? "CAD bridge request timed out" : String(n?.message || n || "CAD bridge request failed"));
    } finally {
      o.cancel();
    }
  }
  async function v(e, r, i = {}) {
    const o = String(e || "").trim();
    if (!o) return {
      ok: false,
      error: "invalid_event",
      message: "Missing CAD bridge event name"
    };
    const n = Math.max(1e3, Number(i.timeoutMs) || 1e4), u = re();
    let d = null;
    for (const l of u) try {
      const c = ie(await ae(`${l}/${o}`, r, n));
      if (te(c) || !ne(c)) {
        d = new Error(`Invalid CAD bridge callback payload from ${l}`);
        continue;
      }
      return c && typeof c == "object" && !c.__endpoint ? {
        ...c,
        __endpoint: l
      } : c;
    } catch (c) {
      d = c;
    }
    return {
      ok: false,
      error: "bridge_unreachable",
      message: String(d?.message || "Unable to contact CAD bridge")
    };
  }
  const se = await W("react"), { useEffect: D, useState: m } = se, E = "__quokkaFinesVicDialogBlockInstalled";
  function de() {
    if (!(typeof window > "u") && !window[E]) {
      window[E] = true;
      try {
        window.alert = () => {
        }, window.confirm = () => false, window.prompt = () => null;
      } catch {
      }
    }
  }
  de();
  function _(e) {
    const r = Number(e || 0);
    if (!Number.isFinite(r)) return "$0";
    try {
      return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        maximumFractionDigits: 0
      }).format(r);
    } catch {
      return `$${Math.round(r).toLocaleString()}`;
    }
  }
  function P(e) {
    const r = String(e || "").trim();
    if (!r) return "";
    const i = Date.parse(r);
    if (!Number.isFinite(i)) return r;
    try {
      return new Intl.DateTimeFormat("en-AU", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(new Date(i));
    } catch {
      return r;
    }
  }
  function ce(e) {
    if (e?.can_pay_online) return {
      bg: "rgba(22,163,74,0.18)",
      border: "rgba(34,197,94,0.34)",
      text: "#bbf7d0"
    };
    const r = String(e?.payable_status || "").toLowerCase();
    return r === "paid" ? {
      bg: "rgba(59,130,246,0.16)",
      border: "rgba(96,165,250,0.3)",
      text: "#bfdbfe"
    } : r === "court_listed" ? {
      bg: "rgba(245,158,11,0.16)",
      border: "rgba(251,191,36,0.3)",
      text: "#fde68a"
    } : {
      bg: "rgba(148,163,184,0.14)",
      border: "rgba(148,163,184,0.22)",
      text: "#cbd5e1"
    };
  }
  function le({ status: e }) {
    if (!e?.message) return null;
    const r = e.type === "error" ? {
      border: "rgba(239,68,68,0.35)",
      bg: "rgba(127,29,29,0.18)",
      text: "#fecaca"
    } : e.type === "success" ? {
      border: "rgba(34,197,94,0.35)",
      bg: "rgba(20,83,45,0.18)",
      text: "#bbf7d0"
    } : {
      border: "rgba(245,158,11,0.3)",
      bg: "rgba(120,53,15,0.16)",
      text: "#fde68a"
    };
    return t.jsx("div", {
      style: {
        borderRadius: 12,
        border: `1px solid ${r.border}`,
        background: r.bg,
        color: r.text,
        fontSize: 12.5,
        lineHeight: 1.35,
        padding: "10px 12px",
        whiteSpace: "pre-wrap"
      },
      children: e.message
    });
  }
  function $({ notice: e, payingNoticeId: r, onPay: i }) {
    const o = ce(e), n = Number(r) === Number(e?.id), u = String(e?.payable_status || "").replace(/_/g, " ").trim() || "unknown", d = P(e?.due_date), l = P(e?.court_date);
    return t.jsxs("div", {
      style: {
        borderRadius: 14,
        border: "1px solid rgba(148,163,184,0.2)",
        background: "rgba(15,23,42,0.5)",
        padding: 12,
        display: "grid",
        gap: 8
      },
      children: [
        t.jsxs("div", {
          style: {
            display: "flex",
            alignItems: "start",
            justifyContent: "space-between",
            gap: 10
          },
          children: [
            t.jsxs("div", {
              style: {
                minWidth: 0
              },
              children: [
                t.jsx("div", {
                  style: {
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#f8fbff",
                    lineHeight: 1.25
                  },
                  children: String(e?.title || "").trim() || "Infringement Notice"
                }),
                t.jsxs("div", {
                  style: {
                    fontSize: 11.5,
                    color: "#b8cae6",
                    marginTop: 2
                  },
                  children: [
                    String(e?.notice_number || `Notice #${e?.id || "?"}`),
                    String(e?.vehicle_plate || "").trim() ? ` \u2022 ${String(e.vehicle_plate).trim()}` : ""
                  ]
                })
              ]
            }),
            t.jsxs("div", {
              style: {
                textAlign: "right",
                flexShrink: 0
              },
              children: [
                t.jsx("div", {
                  style: {
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#fff6d6"
                  },
                  children: _(e?.amount)
                }),
                t.jsx("div", {
                  style: {
                    marginTop: 4,
                    borderRadius: 999,
                    border: `1px solid ${o.border}`,
                    background: o.bg,
                    color: o.text,
                    padding: "3px 8px",
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    display: "inline-block"
                  },
                  children: e?.can_pay_online ? "Pay Online" : u
                })
              ]
            })
          ]
        }),
        (d || l || e?.department_short_name) && t.jsxs("div", {
          style: {
            display: "flex",
            flexWrap: "wrap",
            gap: 6
          },
          children: [
            e?.department_short_name && t.jsx("span", {
              style: {
                fontSize: 10.5,
                color: "#dbeafe",
                border: "1px solid rgba(59,130,246,0.2)",
                background: "rgba(37,99,235,0.08)",
                borderRadius: 999,
                padding: "2px 7px"
              },
              children: e.department_short_name
            }),
            d && t.jsxs("span", {
              style: {
                fontSize: 10.5,
                color: "#e5e7eb",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 999,
                padding: "2px 7px"
              },
              children: [
                "Due ",
                d
              ]
            }),
            l && t.jsxs("span", {
              style: {
                fontSize: 10.5,
                color: "#fde68a",
                border: "1px solid rgba(245,158,11,0.22)",
                background: "rgba(245,158,11,0.05)",
                borderRadius: 999,
                padding: "2px 7px"
              },
              children: [
                "Court ",
                l
              ]
            })
          ]
        }),
        String(e?.description || "").trim() && t.jsx("div", {
          style: {
            fontSize: 11.5,
            color: "#cbd5e1",
            lineHeight: 1.35
          },
          children: String(e.description).trim()
        }),
        e?.can_pay_online ? t.jsx("button", {
          type: "button",
          onClick: () => i(e),
          disabled: n,
          style: {
            border: "1px solid rgba(234,179,8,0.35)",
            background: n ? "linear-gradient(135deg, rgba(161,98,7,0.7), rgba(146,64,14,0.65))" : "linear-gradient(135deg, #f5c84c, #eab308)",
            color: "#1f1400",
            borderRadius: 10,
            padding: "9px 10px",
            fontSize: 12.5,
            fontWeight: 800,
            cursor: n ? "default" : "pointer",
            opacity: n ? 0.9 : 1
          },
          children: n ? "Processing Payment..." : `Pay ${_(e?.amount)}`
        }) : t.jsx("div", {
          style: {
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.16)",
            background: "rgba(15,23,42,0.35)",
            color: "#9fb4d1",
            padding: "8px 10px",
            fontSize: 11.5,
            lineHeight: 1.35
          },
          children: String(e?.pay_block_reason || "").trim() || "This notice cannot be paid online."
        })
      ]
    });
  }
  fe = function() {
    const [e, r] = m(false), [i, o] = m(false), [n, u] = m(0), [d, l] = m(null), [c, S] = m([]), [y, j] = m({
      total_outstanding: 0,
      payable_count: 0,
      total_notices: 0
    }), [O, B] = m("bank"), [k, T] = m(""), [F, p] = m({
      type: "info",
      message: "Load your infringement notices and pay eligible fines online through Fines Victoria."
    });
    D(() => {
      if (typeof window > "u") return;
      const s = window.alert, a = window.confirm, g = window.prompt, f = (b, x) => {
        const A = String(x || "").trim(), U = A ? ` (${A.slice(0, 180)})` : "";
        p({
          type: "error",
          message: `A native browser ${b} dialog was blocked inside the phone app${U}. This usually means an old app bundle or browser fallback path was triggered.`
        });
        try {
          console.warn(`[FinesVictoria] Blocked native ${b} dialog`, x);
        } catch {
        }
      };
      return window.alert = (b) => {
        f("alert", b);
      }, window.confirm = (b) => (f("confirm", b), false), window.prompt = (b) => (f("prompt", b), null), () => {
        window.alert = s, window.confirm = a, window.prompt = g;
      };
    }, []);
    async function h({ silent: s = false } = {}) {
      if (!(e || i || n > 0)) {
        s ? o(true) : r(true), s || p({
          type: "info",
          message: "Loading your infringement notices..."
        });
        try {
          const a = await v("cadBridgeNpwdFinesVicList", {}, {
            timeoutMs: 15e3
          });
          if (!(a?.ok === true || a?.success === true)) {
            S([]), j({
              total_outstanding: 0,
              payable_count: 0,
              total_notices: 0
            }), p({
              type: "error",
              message: String(a?.message || "Unable to load infringement notices from Fines Victoria.")
            });
            return;
          }
          const f = Array.isArray(a?.notices) ? a.notices : [];
          S(f), j({
            total_outstanding: Number(a?.summary?.total_outstanding || 0) || 0,
            payable_count: Number(a?.summary?.payable_count || 0) || 0,
            total_notices: Number(a?.summary?.total_notices || f.length || 0) || 0
          }), B(String(a?.account || "bank")), T(String(a?.character_name || "").trim()), f.length ? (Number(a?.summary?.payable_count || 0) || 0) > 0 ? p({
            type: "success",
            message: `Loaded ${f.length} notice${f.length === 1 ? "" : "s"}. ${Number(a?.summary?.payable_count || 0)} can be paid online now.`
          }) : p({
            type: "info",
            message: `Loaded ${f.length} notice${f.length === 1 ? "" : "s"}. None are currently payable online.`
          }) : p({
            type: "success",
            message: "No infringement notices were found for your current character."
          });
        } catch (a) {
          p({
            type: "error",
            message: `Unable to contact CAD bridge: ${String(a?.message || a || "unknown error")}`
          });
        } finally {
          r(false), o(false);
        }
      }
    }
    D(() => {
      h();
    }, []);
    async function C(s) {
      !Number(s?.id || 0) || n > 0 || s?.can_pay_online === true && l(s);
    }
    async function L() {
      const s = d, a = Number(s?.id || 0);
      if (!(!a || n > 0)) {
        if (s?.can_pay_online !== true) {
          l(null);
          return;
        }
        l(null), u(a), p({
          type: "info",
          message: `Processing payment for ${String(s?.notice_number || `Notice #${a}`)}...`
        });
        try {
          console.log("[FinesVictoria] Starting payment request", {
            noticeId: a
          });
          const g = await v("cadBridgeNpwdFinesVicPay", {
            notice_id: a
          }, {
            timeoutMs: 3e4
          });
          if (console.log("[FinesVictoria] Payment response", g), !(g?.ok === true || g?.success === true)) {
            const x = g?.funds_deducted === true;
            p({
              type: "error",
              message: String(g?.message || (x ? "Funds were deducted, but CAD could not confirm the payment. Please contact staff." : "Payment failed."))
            }), await h({
              silent: true
            });
            return;
          }
          const b = g?.notice || null;
          p({
            type: "success",
            message: String(g?.message || `Payment successful for ${String(b?.notice_number || s?.notice_number || `Notice #${a}`)}.`)
          }), await h({
            silent: true
          });
        } catch (g) {
          p({
            type: "error",
            message: `Payment failed: ${String(g?.message || g || "unknown error")}`
          });
        } finally {
          u(0);
        }
      }
    }
    const R = c.filter((s) => s?.can_pay_online), N = c.filter((s) => !s?.can_pay_online);
    return t.jsxs("div", {
      style: {
        height: "100%",
        display: "flex",
        flexDirection: "column",
        color: "#f8fbff",
        background: "radial-gradient(circle at 12% 6%, rgba(245, 200, 76, 0.18), transparent 46%), linear-gradient(180deg, #1a1303 0%, #201706 55%, #130d03 100%)",
        fontFamily: "Segoe UI, system-ui, sans-serif"
      },
      children: [
        t.jsxs("div", {
          style: {
            padding: "14px 14px 8px",
            display: "flex",
            alignItems: "center",
            gap: 10
          },
          children: [
            t.jsx("div", {
              style: {
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "#fff8df",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 8px 18px rgba(0,0,0,0.25)"
              },
              children: t.jsx("img", {
                src: K,
                alt: "Fines Victoria",
                style: {
                  width: 30,
                  height: 30,
                  objectFit: "contain",
                  borderRadius: 6
                }
              })
            }),
            t.jsxs("div", {
              style: {
                minWidth: 0,
                flex: 1
              },
              children: [
                t.jsx("div", {
                  style: {
                    fontSize: 17,
                    fontWeight: 800,
                    lineHeight: 1.05,
                    color: "#fff7db"
                  },
                  children: "Fines Victoria"
                }),
                t.jsxs("div", {
                  style: {
                    color: "#d8c27e",
                    fontSize: 11.5
                  },
                  children: [
                    "Pay infringement notices online",
                    k ? ` \u2022 ${k}` : ""
                  ]
                })
              ]
            }),
            t.jsx("button", {
              type: "button",
              onClick: () => h({
                silent: false
              }),
              disabled: e || i || n > 0,
              style: {
                borderRadius: 10,
                border: "1px solid rgba(245,200,76,0.25)",
                background: "rgba(245,200,76,0.09)",
                color: "#ffe8a3",
                fontSize: 11.5,
                fontWeight: 700,
                padding: "7px 10px",
                cursor: e || i || n > 0 ? "default" : "pointer",
                opacity: e || i || n > 0 ? 0.7 : 1
              },
              children: e || i ? "Refreshing..." : "Refresh"
            })
          ]
        }),
        t.jsxs("div", {
          style: {
            padding: "0 14px 14px",
            display: "grid",
            gap: 12,
            overflow: "auto"
          },
          children: [
            t.jsx("div", {
              style: {
                borderRadius: 14,
                border: "1px solid rgba(245,200,76,0.2)",
                background: "linear-gradient(180deg, rgba(245,200,76,0.08), rgba(15,23,42,0.35))",
                padding: 12,
                display: "grid",
                gap: 8
              },
              children: t.jsxs("div", {
                style: {
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  alignItems: "center"
                },
                children: [
                  t.jsxs("div", {
                    children: [
                      t.jsx("div", {
                        style: {
                          fontSize: 11,
                          color: "#cdb56f",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em"
                        },
                        children: "Outstanding Online Payable"
                      }),
                      t.jsx("div", {
                        style: {
                          marginTop: 2,
                          fontSize: 22,
                          fontWeight: 900,
                          color: "#fff3bf"
                        },
                        children: _(y?.total_outstanding)
                      })
                    ]
                  }),
                  t.jsxs("div", {
                    style: {
                      textAlign: "right",
                      fontSize: 11.5,
                      color: "#d4d4d8"
                    },
                    children: [
                      t.jsxs("div", {
                        children: [
                          Number(y?.payable_count || 0),
                          " payable"
                        ]
                      }),
                      t.jsxs("div", {
                        children: [
                          Number(y?.total_notices || c.length || 0),
                          " total notices"
                        ]
                      }),
                      t.jsxs("div", {
                        style: {
                          color: "#aab9d3",
                          marginTop: 2
                        },
                        children: [
                          "Debit account: ",
                          String(O || "bank")
                        ]
                      })
                    ]
                  })
                ]
              })
            }),
            t.jsx(le, {
              status: F
            }),
            d ? t.jsxs("div", {
              style: {
                borderRadius: 14,
                border: "1px solid rgba(245,200,76,0.28)",
                background: "linear-gradient(180deg, rgba(245,200,76,0.08), rgba(15,23,42,0.42))",
                padding: 12,
                display: "grid",
                gap: 8
              },
              children: [
                t.jsx("div", {
                  style: {
                    fontSize: 11,
                    color: "#d6c27f",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 700
                  },
                  children: "Confirm Payment"
                }),
                t.jsxs("div", {
                  style: {
                    fontSize: 12.5,
                    color: "#f8fbff",
                    lineHeight: 1.35
                  },
                  children: [
                    "Pay ",
                    t.jsx("strong", {
                      children: _(d?.amount)
                    }),
                    " for",
                    " ",
                    t.jsx("strong", {
                      children: String(d?.notice_number || `Notice #${d?.id || "?"}`)
                    }),
                    "?"
                  ]
                }),
                t.jsxs("div", {
                  style: {
                    display: "flex",
                    gap: 8
                  },
                  children: [
                    t.jsx("button", {
                      type: "button",
                      onClick: () => l(null),
                      disabled: n > 0,
                      style: {
                        flex: 1,
                        borderRadius: 10,
                        border: "1px solid rgba(148,163,184,0.22)",
                        background: "rgba(15,23,42,0.35)",
                        color: "#dbeafe",
                        padding: "9px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: n > 0 ? "default" : "pointer",
                        opacity: n > 0 ? 0.7 : 1
                      },
                      children: "Cancel"
                    }),
                    t.jsx("button", {
                      type: "button",
                      onClick: L,
                      disabled: n > 0,
                      style: {
                        flex: 1,
                        borderRadius: 10,
                        border: "1px solid rgba(234,179,8,0.35)",
                        background: "linear-gradient(135deg, #f5c84c, #eab308)",
                        color: "#1f1400",
                        padding: "9px 10px",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: n > 0 ? "default" : "pointer",
                        opacity: n > 0 ? 0.7 : 1
                      },
                      children: "Confirm Pay"
                    })
                  ]
                })
              ]
            }) : null,
            e && c.length === 0 ? t.jsx("div", {
              style: {
                fontSize: 12.5,
                color: "#cbd5e1",
                padding: "4px 2px"
              },
              children: "Loading notices..."
            }) : null,
            R.length > 0 && t.jsxs("div", {
              style: {
                display: "grid",
                gap: 8
              },
              children: [
                t.jsx("div", {
                  style: {
                    fontSize: 11,
                    color: "#d6c27f",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 700
                  },
                  children: "Pay Online Now"
                }),
                R.map((s) => t.jsx($, {
                  notice: s,
                  payingNoticeId: n,
                  onPay: C
                }, `payable-${s.id}`))
              ]
            }),
            N.length > 0 && t.jsxs("div", {
              style: {
                display: "grid",
                gap: 8
              },
              children: [
                t.jsx("div", {
                  style: {
                    fontSize: 11,
                    color: "#b8c7e3",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 700
                  },
                  children: "Other Notices"
                }),
                N.map((s) => t.jsx($, {
                  notice: s,
                  payingNoticeId: n,
                  onPay: C
                }, `other-${s.id}`))
              ]
            }),
            !e && c.length === 0 && t.jsx("div", {
              style: {
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.14)",
                background: "rgba(15,23,42,0.32)",
                padding: 12,
                fontSize: 12,
                color: "#aab9d3",
                lineHeight: 1.4
              },
              children: "No infringement notices were found for your current character. If you expected a notice, refresh after a few seconds."
            })
          ]
        })
      ]
    });
  };
});
export {
  fe as A,
  __tla,
  t as j,
  K as l
};
