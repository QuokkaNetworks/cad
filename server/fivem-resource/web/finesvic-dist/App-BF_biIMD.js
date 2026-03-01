import { importShared as V, __tla as __tla_0 } from "./__federation_fn_import-C_7gNWqI.js";
import { r as q } from "./index-CtmpQeow.js";
let ce, t, Z;
let __tla = Promise.all([
  (() => {
    try {
      return __tla_0;
    } catch {
    }
  })()
]).then(async () => {
  var I = {
    exports: {}
  }, w = {};
  var M = q, H = Symbol.for("react.element"), J = Symbol.for("react.fragment"), G = Object.prototype.hasOwnProperty, Y = M.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, K = {
    key: true,
    ref: true,
    __self: true,
    __source: true
  };
  function E(e, r, d) {
    var i, n = {}, l = null, c = null;
    d !== void 0 && (l = "" + d), r.key !== void 0 && (l = "" + r.key), r.ref !== void 0 && (c = r.ref);
    for (i in r) G.call(r, i) && !K.hasOwnProperty(i) && (n[i] = r[i]);
    if (e && e.defaultProps) for (i in r = e.defaultProps, r) n[i] === void 0 && (n[i] = r[i]);
    return {
      $$typeof: H,
      type: e,
      key: l,
      ref: c,
      props: n,
      _owner: Y.current
    };
  }
  w.Fragment = J;
  w.jsx = E;
  w.jsxs = E;
  I.exports = w;
  t = I.exports;
  let R, Q;
  Z = "" + new URL("FinesVicLogo-CZ7ggJBL.jpg", import.meta.url).href;
  R = "cad_bridge";
  Q = [
    `https://cfx-nui-${R}`,
    `https://${R}`
  ];
  function X(e) {
    return !!e && typeof e == "object" && !Array.isArray(e) && Object.keys(e).length === 0;
  }
  function ee(e) {
    return !e || typeof e != "object" || Array.isArray(e) ? false : "ok" in e || "success" in e || "error" in e || "message" in e || "payload" in e || "notice" in e || "notices" in e || "summary" in e;
  }
  function te(e) {
    const r = Math.max(1e3, Number(e) || 1e4);
    if (typeof AbortController > "u") return {
      signal: void 0,
      cancel: () => {
      },
      timeout: r
    };
    const d = new AbortController(), i = setTimeout(() => d.abort(new Error("Request timed out")), r);
    return {
      signal: d.signal,
      timeout: r,
      cancel: () => clearTimeout(i)
    };
  }
  async function re(e, r, d) {
    const i = te(d);
    try {
      const n = fetch(e, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8"
        },
        cache: "no-store",
        credentials: "omit",
        signal: i.signal,
        body: JSON.stringify(r || {})
      }), l = new Promise((S, y) => {
        setTimeout(() => y(new Error("CAD bridge request timed out")), i.timeout || Math.max(1e3, Number(d) || 1e4));
      }), c = await Promise.race([
        n,
        l
      ]), s = await c.text();
      let p = null;
      try {
        p = JSON.parse(s || "{}");
      } catch {
        p = null;
      }
      return c.ok ? p || {
        ok: false,
        error: "invalid_json",
        message: s || "Invalid response from CAD bridge"
      } : p || {
        ok: false,
        error: "http_error",
        status: c.status,
        message: s || `CAD bridge request failed (${c.status})`
      };
    } catch (n) {
      const l = String(n?.name || "").toLowerCase() === "aborterror";
      throw new Error(l ? "CAD bridge request timed out" : String(n?.message || n || "CAD bridge request failed"));
    } finally {
      i.cancel();
    }
  }
  async function $(e, r, d = {}) {
    const i = String(e || "").trim();
    if (!i) return {
      ok: false,
      error: "invalid_event",
      message: "Missing CAD bridge event name"
    };
    const n = Math.max(1e3, Number(d.timeoutMs) || 1e4);
    let l = null;
    for (const c of Q) try {
      const s = await re(`${c}/${i}`, r, n);
      if (X(s) || !ee(s)) {
        l = new Error(`Invalid CAD bridge callback payload from ${c}`);
        continue;
      }
      return s && typeof s == "object" && !s.__endpoint ? {
        ...s,
        __endpoint: c
      } : s;
    } catch (s) {
      l = s;
    }
    return {
      ok: false,
      error: "bridge_unreachable",
      message: String(l?.message || "Unable to contact CAD bridge")
    };
  }
  const ne = await V("react"), { useEffect: A, useState: m } = ne, D = "__quokkaFinesVicDialogBlockInstalled";
  function ie() {
    if (!(typeof window > "u") && !window[D]) {
      window[D] = true;
      try {
        window.alert = () => {
        }, window.confirm = () => false, window.prompt = () => null;
      } catch {
      }
    }
  }
  ie();
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
  function z(e) {
    const r = String(e || "").trim();
    if (!r) return "";
    const d = Date.parse(r);
    if (!Number.isFinite(d)) return r;
    try {
      return new Intl.DateTimeFormat("en-AU", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(new Date(d));
    } catch {
      return r;
    }
  }
  function oe(e) {
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
  function ae({ status: e }) {
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
  function T({ notice: e, payingNoticeId: r, onPay: d }) {
    const i = oe(e), n = Number(r) === Number(e?.id), l = String(e?.payable_status || "").replace(/_/g, " ").trim() || "unknown", c = z(e?.due_date), s = z(e?.court_date);
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
                    border: `1px solid ${i.border}`,
                    background: i.bg,
                    color: i.text,
                    padding: "3px 8px",
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    display: "inline-block"
                  },
                  children: e?.can_pay_online ? "Pay Online" : l
                })
              ]
            })
          ]
        }),
        (c || s || e?.department_short_name) && t.jsxs("div", {
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
            c && t.jsxs("span", {
              style: {
                fontSize: 10.5,
                color: "#e5e7eb",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 999,
                padding: "2px 7px"
              },
              children: [
                "Due ",
                c
              ]
            }),
            s && t.jsxs("span", {
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
                s
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
          onClick: () => d(e),
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
  ce = function() {
    const [e, r] = m(false), [d, i] = m(false), [n, l] = m(0), [c, s] = m(null), [p, S] = m([]), [y, j] = m({
      total_outstanding: 0,
      payable_count: 0,
      total_notices: 0
    }), [F, O] = m("bank"), [k, L] = m(""), [W, f] = m({
      type: "info",
      message: "Load your infringement notices and pay eligible fines online through Fines Victoria."
    });
    A(() => {
      if (typeof window > "u") return;
      const a = window.alert, o = window.confirm, g = window.prompt, u = (b, x) => {
        const P = String(x || "").trim(), U = P ? ` (${P.slice(0, 180)})` : "";
        f({
          type: "error",
          message: `A native browser ${b} dialog was blocked inside the phone app${U}. This usually means an old app bundle or browser fallback path was triggered.`
        });
        try {
          console.warn(`[FinesVictoria] Blocked native ${b} dialog`, x);
        } catch {
        }
      };
      return window.alert = (b) => {
        u("alert", b);
      }, window.confirm = (b) => (u("confirm", b), false), window.prompt = (b) => (u("prompt", b), null), () => {
        window.alert = a, window.confirm = o, window.prompt = g;
      };
    }, []);
    async function h({ silent: a = false } = {}) {
      if (!(e || d || n > 0)) {
        a ? i(true) : r(true), a || f({
          type: "info",
          message: "Loading your infringement notices..."
        });
        try {
          const o = await $("cadBridgeNpwdFinesVicList", {}, {
            timeoutMs: 15e3
          });
          if (!(o?.ok === true || o?.success === true)) {
            S([]), j({
              total_outstanding: 0,
              payable_count: 0,
              total_notices: 0
            }), f({
              type: "error",
              message: String(o?.message || "Unable to load infringement notices from Fines Victoria.")
            });
            return;
          }
          const u = Array.isArray(o?.notices) ? o.notices : [];
          S(u), j({
            total_outstanding: Number(o?.summary?.total_outstanding || 0) || 0,
            payable_count: Number(o?.summary?.payable_count || 0) || 0,
            total_notices: Number(o?.summary?.total_notices || u.length || 0) || 0
          }), O(String(o?.account || "bank")), L(String(o?.character_name || "").trim()), u.length ? (Number(o?.summary?.payable_count || 0) || 0) > 0 ? f({
            type: "success",
            message: `Loaded ${u.length} notice${u.length === 1 ? "" : "s"}. ${Number(o?.summary?.payable_count || 0)} can be paid online now.`
          }) : f({
            type: "info",
            message: `Loaded ${u.length} notice${u.length === 1 ? "" : "s"}. None are currently payable online.`
          }) : f({
            type: "success",
            message: "No infringement notices were found for your current character."
          });
        } catch (o) {
          f({
            type: "error",
            message: `Unable to contact CAD bridge: ${String(o?.message || o || "unknown error")}`
          });
        } finally {
          r(false), i(false);
        }
      }
    }
    A(() => {
      h();
    }, []);
    async function N(a) {
      !Number(a?.id || 0) || n > 0 || a?.can_pay_online === true && s(a);
    }
    async function B() {
      const a = c, o = Number(a?.id || 0);
      if (!(!o || n > 0)) {
        if (a?.can_pay_online !== true) {
          s(null);
          return;
        }
        s(null), l(o), f({
          type: "info",
          message: `Processing payment for ${String(a?.notice_number || `Notice #${o}`)}...`
        });
        try {
          console.log("[FinesVictoria] Starting payment request", {
            noticeId: o
          });
          const g = await $("cadBridgeNpwdFinesVicPay", {
            notice_id: o
          }, {
            timeoutMs: 3e4
          });
          if (console.log("[FinesVictoria] Payment response", g), !(g?.ok === true || g?.success === true)) {
            const x = g?.funds_deducted === true;
            f({
              type: "error",
              message: String(g?.message || (x ? "Funds were deducted, but CAD could not confirm the payment. Please contact staff." : "Payment failed."))
            }), await h({
              silent: true
            });
            return;
          }
          const b = g?.notice || null;
          f({
            type: "success",
            message: String(g?.message || `Payment successful for ${String(b?.notice_number || a?.notice_number || `Notice #${o}`)}.`)
          }), await h({
            silent: true
          });
        } catch (g) {
          f({
            type: "error",
            message: `Payment failed: ${String(g?.message || g || "unknown error")}`
          });
        } finally {
          l(0);
        }
      }
    }
    const v = p.filter((a) => a?.can_pay_online), C = p.filter((a) => !a?.can_pay_online);
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
                src: Z,
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
              disabled: e || d || n > 0,
              style: {
                borderRadius: 10,
                border: "1px solid rgba(245,200,76,0.25)",
                background: "rgba(245,200,76,0.09)",
                color: "#ffe8a3",
                fontSize: 11.5,
                fontWeight: 700,
                padding: "7px 10px",
                cursor: e || d || n > 0 ? "default" : "pointer",
                opacity: e || d || n > 0 ? 0.7 : 1
              },
              children: e || d ? "Refreshing..." : "Refresh"
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
                          Number(y?.total_notices || p.length || 0),
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
                          String(F || "bank")
                        ]
                      })
                    ]
                  })
                ]
              })
            }),
            t.jsx(ae, {
              status: W
            }),
            c ? t.jsxs("div", {
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
                      children: _(c?.amount)
                    }),
                    " for",
                    " ",
                    t.jsx("strong", {
                      children: String(c?.notice_number || `Notice #${c?.id || "?"}`)
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
                      onClick: () => s(null),
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
                      onClick: B,
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
            e && p.length === 0 ? t.jsx("div", {
              style: {
                fontSize: 12.5,
                color: "#cbd5e1",
                padding: "4px 2px"
              },
              children: "Loading notices..."
            }) : null,
            v.length > 0 && t.jsxs("div", {
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
                v.map((a) => t.jsx(T, {
                  notice: a,
                  payingNoticeId: n,
                  onPay: N
                }, `payable-${a.id}`))
              ]
            }),
            C.length > 0 && t.jsxs("div", {
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
                C.map((a) => t.jsx(T, {
                  notice: a,
                  payingNoticeId: n,
                  onPay: N
                }, `other-${a.id}`))
              ]
            }),
            !e && p.length === 0 && t.jsx("div", {
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
  ce as A,
  __tla,
  t as j,
  Z as l
};
