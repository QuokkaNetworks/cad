import { importShared as M, __tla as __tla_0 } from "./__federation_fn_import-C_7gNWqI.js";
import { r as V } from "./index-CtmpQeow.js";
let ue, i, G;
let __tla = Promise.all([
  (() => {
    try {
      return __tla_0;
    } catch {
    }
  })()
]).then(async () => {
  var k = {
    exports: {}
  }, S = {};
  var I = V, z = Symbol.for("react.element"), P = Symbol.for("react.fragment"), $ = Object.prototype.hasOwnProperty, q = I.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, F = {
    key: true,
    ref: true,
    __self: true,
    __source: true
  };
  function E(r, e, n) {
    var o, t = {}, a = null, s = null;
    n !== void 0 && (a = "" + n), e.key !== void 0 && (a = "" + e.key), e.ref !== void 0 && (s = e.ref);
    for (o in e) $.call(e, o) && !F.hasOwnProperty(o) && (t[o] = e[o]);
    if (r && r.defaultProps) for (o in e = r.defaultProps, e) t[o] === void 0 && (t[o] = e[o]);
    return {
      $$typeof: z,
      type: r,
      key: a,
      ref: s,
      props: t,
      _owner: q.current
    };
  }
  S.Fragment = P;
  S.jsx = E;
  S.jsxs = E;
  k.exports = S;
  i = k.exports;
  let W;
  G = "" + new URL("vicroads-logo-KiEZIsn3.png", import.meta.url).href;
  W = [
    "cad_bridge",
    "fivem-resource",
    "fivem_resource"
  ];
  function H(r) {
    const e = String(r || "").trim();
    return !e || !/^[a-z0-9_-]+$/i.test(e) ? "" : e;
  }
  function J(r) {
    const e = [], n = /* @__PURE__ */ new Set();
    for (const o of Array.isArray(r) ? r : []) {
      const t = H(o);
      !t || n.has(t) || (n.add(t), e.push(t));
    }
    return e;
  }
  function Y() {
    const r = [];
    if (typeof window < "u") {
      const e = [
        window.CAD_BRIDGE_RESOURCE,
        window.cadBridgeResource,
        window.__CAD_BRIDGE_RESOURCE__,
        window.__cadBridgeResource__
      ];
      Array.isArray(window.CAD_BRIDGE_RESOURCES) && e.push(...window.CAD_BRIDGE_RESOURCES), Array.isArray(window.__CAD_BRIDGE_RESOURCES__) && e.push(...window.__CAD_BRIDGE_RESOURCES__);
      try {
        const n = new URLSearchParams(String(window.location?.search || ""));
        e.push(n.get("cadBridgeResource")), e.push(n.get("cad_bridge_resource"));
      } catch {
      }
      try {
        e.push(window.localStorage?.getItem("cad_bridge_resource"));
      } catch {
      }
      r.push(...e);
    }
    return r.push(...W), J(r);
  }
  function K() {
    const r = Y(), e = [];
    for (const n of r) e.push(`https://cfx-nui-${n}`), e.push(`https://${n}`);
    return e;
  }
  function Z(r) {
    return !!r && typeof r == "object" && !Array.isArray(r) && Object.keys(r).length === 0;
  }
  function Q(r) {
    return !r || typeof r != "object" || Array.isArray(r) ? false : "ok" in r || "success" in r || "error" in r || "message" in r || "payload" in r || "notice" in r || "notices" in r || "summary" in r;
  }
  function X(r) {
    if (r && typeof r == "object" && !Array.isArray(r)) return r;
    if (r === false) return {
      ok: false,
      error: "callback_failed",
      message: "CAD bridge callback returned false."
    };
    const e = String(r || "").trim();
    return e ? {
      ok: false,
      error: "invalid_payload",
      message: e
    } : {
      ok: false,
      error: "invalid_payload",
      message: "CAD bridge returned an empty payload."
    };
  }
  function ee(r) {
    const e = Math.max(1e3, Number(r) || 1e4);
    if (typeof AbortController > "u") return {
      signal: void 0,
      cancel: () => {
      },
      timeout: e
    };
    const n = new AbortController(), o = setTimeout(() => n.abort(new Error("Request timed out")), e);
    return {
      signal: n.signal,
      timeout: e,
      cancel: () => clearTimeout(o)
    };
  }
  async function re(r, e, n) {
    const o = ee(n);
    try {
      const t = fetch(r, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8"
        },
        cache: "no-store",
        signal: o.signal,
        body: JSON.stringify(e || {})
      }), a = new Promise((C, l) => {
        setTimeout(() => l(new Error("CAD bridge request timed out")), o.timeout || Math.max(1e3, Number(n) || 1e4));
      }), s = await Promise.race([
        t,
        a
      ]), d = await s.text();
      let c = null;
      try {
        c = JSON.parse(d || "{}");
      } catch {
        c = null;
      }
      return s.ok ? c || {
        ok: false,
        error: "invalid_json",
        message: d || "Invalid response from CAD bridge"
      } : c || {
        ok: false,
        error: "http_error",
        status: s.status,
        message: d || `CAD bridge request failed (${s.status})`
      };
    } catch (t) {
      const a = String(t?.name || "").toLowerCase() === "aborterror";
      throw new Error(a ? "CAD bridge request timed out" : String(t?.message || t || "CAD bridge request failed"));
    } finally {
      o.cancel();
    }
  }
  async function D(r, e, n = {}) {
    const o = String(r || "").trim();
    if (!o) return {
      ok: false,
      error: "invalid_event",
      message: "Missing CAD bridge event name"
    };
    const t = Math.max(1e3, Number(n.timeoutMs) || 1e4), a = K();
    let s = null;
    for (const d of a) try {
      const c = X(await re(`${d}/${o}`, e, t));
      if (Z(c) || !Q(c)) {
        s = new Error(`Invalid CAD bridge callback payload from ${d}`);
        continue;
      }
      return c;
    } catch (c) {
      s = c;
    }
    return {
      ok: false,
      error: "bridge_unreachable",
      message: String(s?.message || "Unable to contact CAD bridge")
    };
  }
  const te = await M("react"), { useMemo: ie, useState: h } = te, f = 35, ne = {
    owner_name: "",
    plate: "",
    vehicle_model: "",
    vehicle_colour: "",
    duration_days: f,
    duration_options: [
      f
    ]
  };
  function _(r, e = f) {
    const n = Array.isArray(r) ? r : [], o = /* @__PURE__ */ new Set(), t = [];
    for (const a of n) {
      const s = Math.floor(Number(a) || 0);
      !Number.isFinite(s) || s < 1 || o.has(s) || (o.add(s), t.push(s));
    }
    return t.length || t.push(Math.max(1, Math.floor(Number(e) || f))), t.sort((a, s) => a - s), t;
  }
  function oe(r) {
    const e = Number(r) || 0;
    return e === 1 ? "Temporary (1 day)" : e === 6 ? "6 months (6 days)" : e === 14 ? "2 years (2 weeks)" : e === 35 ? "5 years (5 weeks)" : e === 70 ? "10 years (10 weeks)" : `${e} day${e === 1 ? "" : "s"}`;
  }
  function ae(r) {
    const e = r && typeof r == "object" ? r : {}, n = Math.max(1, Math.floor(Number(e.default_duration_days || e.duration_days || f) || f)), o = _(e.duration_options, n), t = o.includes(n) ? n : o[0];
    return {
      owner_name: String(e.owner_name || e.character_name || "").trim(),
      plate: String(e.plate || "").trim().toUpperCase(),
      vehicle_model: String(e.vehicle_model || e.model || "").trim(),
      vehicle_colour: String(e.vehicle_colour || e.colour || e.color || "").trim(),
      duration_days: t,
      duration_options: o
    };
  }
  function x() {
    return {
      borderRadius: 14,
      border: "1px solid rgba(148,163,184,0.2)",
      background: "rgba(15,23,42,0.44)",
      padding: 12
    };
  }
  function se({ status: r }) {
    if (!r?.message) return null;
    const e = r.type === "error" ? {
      border: "rgba(239,68,68,0.35)",
      bg: "rgba(127,29,29,0.18)",
      text: "#fecaca"
    } : r.type === "success" ? {
      border: "rgba(34,197,94,0.35)",
      bg: "rgba(20,83,45,0.18)",
      text: "#bbf7d0"
    } : {
      border: "rgba(148,163,184,0.22)",
      bg: "rgba(15,23,42,0.32)",
      text: "#dbeafe"
    };
    return i.jsx("div", {
      style: {
        ...x(),
        border: `1px solid ${e.border}`,
        background: e.bg,
        color: e.text,
        fontSize: 12.5,
        lineHeight: 1.35,
        padding: "10px 12px",
        whiteSpace: "pre-wrap"
      },
      children: r.message
    });
  }
  function b({ children: r, required: e = false }) {
    return i.jsxs("div", {
      style: {
        fontSize: 11,
        color: "#b8cae6",
        marginBottom: 4
      },
      children: [
        r,
        e ? i.jsx("span", {
          style: {
            color: "#93c5fd"
          },
          children: " *"
        }) : null
      ]
    });
  }
  function y({ value: r, placeholder: e }) {
    return i.jsx("input", {
      value: r,
      readOnly: true,
      placeholder: e,
      style: {
        width: "100%",
        borderRadius: 10,
        border: "1px solid rgba(148,163,184,0.22)",
        background: "rgba(2,6,23,0.4)",
        color: "#f8fbff",
        padding: "9px 10px",
        fontSize: 12.5,
        outline: "none",
        boxSizing: "border-box"
      }
    });
  }
  function de({ options: r, selected: e, disabled: n, onSelect: o }) {
    return i.jsx("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 8
      },
      children: r.map((t) => {
        const a = Number(e) === Number(t);
        return i.jsx("button", {
          type: "button",
          disabled: n,
          onClick: () => o(t),
          style: {
            borderRadius: 10,
            border: a ? "1px solid rgba(59,130,246,0.55)" : "1px solid rgba(148,163,184,0.22)",
            background: a ? "linear-gradient(135deg, rgba(37,99,235,0.22), rgba(29,78,216,0.16))" : "rgba(2,6,23,0.35)",
            color: a ? "#dbeafe" : "#c2d2ea",
            padding: "9px 10px",
            fontSize: 11.5,
            fontWeight: a ? 700 : 600,
            textAlign: "left",
            cursor: n ? "default" : "pointer",
            opacity: n ? 0.75 : 1
          },
          children: oe(t)
        }, t);
      })
    });
  }
  ue = function() {
    const [r, e] = h(false), [n, o] = h(false), [t, a] = h({
      ...ne
    }), [s, d] = h({
      type: "info",
      message: 'Sit in the vehicle you want to register, then tap "Load Current Vehicle".'
    }), [c, C] = h(""), l = r || n, w = !!(String(t.owner_name || "").trim() && String(t.plate || "").trim() && String(t.vehicle_model || "").trim()), O = ie(() => c || (/* @__PURE__ */ new Date()).toLocaleTimeString(), [
      c
    ]);
    function L(u) {
      const m = Math.max(1, Math.floor(Number(u) || f));
      a((g) => _(g.duration_options, g.duration_days || f).includes(m) ? {
        ...g,
        duration_days: m
      } : g);
    }
    async function N() {
      if (!l) {
        e(true), d({
          type: "info",
          message: "Checking your current vehicle and active character..."
        });
        try {
          const u = await D("cadBridgeNpwdVicRoadsGetPrefill", {}, {
            timeoutMs: 1e4
          });
          if (!(u?.ok === true || u?.success === true)) {
            d({
              type: "error",
              message: String(u?.message || "").trim() || "You must be seated in a vehicle to use VicRoads registration."
            });
            return;
          }
          const g = ae(u?.payload);
          if (!g.owner_name) {
            a(g), d({
              type: "error",
              message: "Vehicle loaded, but your current character could not be resolved. Re-log and try again."
            });
            return;
          }
          a(g), C((/* @__PURE__ */ new Date()).toLocaleTimeString()), d({
            type: "success",
            message: "Vehicle and character loaded. Confirm the registration length, then submit."
          });
        } catch (u) {
          d({
            type: "error",
            message: `Unable to contact CAD bridge: ${String(u?.message || u || "unknown error")}`
          });
        } finally {
          e(false);
        }
      }
    }
    async function B(u) {
      if (u.preventDefault(), l) return;
      const m = String(t.owner_name || "").trim(), g = String(t.plate || "").trim().toUpperCase(), v = String(t.vehicle_model || "").trim(), T = String(t.vehicle_colour || "").trim(), R = _(t.duration_options, t.duration_days || f), j = Math.max(1, Math.floor(Number(t.duration_days || f) || f)), A = R.includes(j) ? j : R[0];
      if (!m || !g || !v) {
        d({
          type: "error",
          message: "Owner, plate, and vehicle model are required. Load the current vehicle again if any field is blank."
        });
        return;
      }
      if (!R.includes(A)) {
        d({
          type: "error",
          message: "Select one of the available registration periods."
        });
        return;
      }
      o(true), d({
        type: "info",
        message: "Submitting registration to CAD..."
      });
      try {
        const p = await D("cadBridgeNpwdVicRoadsSubmitRegistration", {
          owner_name: m,
          character_name: m,
          plate: g,
          vehicle_model: v,
          vehicle_colour: T,
          duration_days: A
        }, {
          timeoutMs: 3e4
        }), U = p?.ok === true || p?.success === true;
        d(U ? {
          type: "success",
          message: String(p?.message || "").trim() || "Vehicle registration submitted successfully."
        } : {
          type: "error",
          message: String(p?.message || "").trim() || "Vehicle registration failed."
        });
      } catch (p) {
        d({
          type: "error",
          message: `Unable to submit registration: ${String(p?.message || p || "unknown error")}`
        });
      } finally {
        o(false);
      }
    }
    return i.jsxs("div", {
      style: {
        height: "100%",
        display: "flex",
        flexDirection: "column",
        color: "#f8fbff",
        background: "radial-gradient(circle at 15% 10%, rgba(59,130,246,0.28), transparent 50%), linear-gradient(180deg, #071228 0%, #0a1936 55%, #081224 100%)",
        fontFamily: "Segoe UI, system-ui, sans-serif"
      },
      children: [
        i.jsxs("div", {
          style: {
            padding: "14px 14px 8px",
            display: "flex",
            alignItems: "center",
            gap: 10
          },
          children: [
            i.jsx("div", {
              style: {
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "#ffffff",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 8px 18px rgba(0,0,0,0.25)"
              },
              children: i.jsx("img", {
                src: G,
                alt: "VicRoads",
                style: {
                  width: 28,
                  height: 28,
                  objectFit: "contain"
                }
              })
            }),
            i.jsxs("div", {
              style: {
                minWidth: 0
              },
              children: [
                i.jsx("div", {
                  style: {
                    fontSize: 17,
                    fontWeight: 700,
                    lineHeight: 1.1
                  },
                  children: "VicRoads"
                }),
                i.jsx("div", {
                  style: {
                    color: "#b8cae6",
                    fontSize: 12
                  },
                  children: "Vehicle Registration"
                })
              ]
            })
          ]
        }),
        i.jsxs("div", {
          style: {
            padding: "0 14px 14px",
            display: "grid",
            gap: 10,
            overflow: "auto"
          },
          children: [
            i.jsxs("div", {
              style: {
                ...x(),
                display: "grid",
                gap: 8
              },
              children: [
                i.jsx("div", {
                  style: {
                    fontSize: 13,
                    color: "#dbeafe",
                    fontWeight: 700
                  },
                  children: "Create Vehicle Registration Record"
                }),
                i.jsx("div", {
                  style: {
                    fontSize: 12,
                    color: "#c2d2ea",
                    lineHeight: 1.35
                  },
                  children: "Pulls vehicle details from your current driver seat and uses your active character as the registered owner."
                }),
                i.jsx("button", {
                  type: "button",
                  onClick: N,
                  disabled: l,
                  style: {
                    border: "1px solid rgba(37,99,235,0.45)",
                    background: r ? "linear-gradient(135deg, rgba(30,64,175,0.6), rgba(30,58,138,0.55))" : "linear-gradient(135deg, #2563eb, #1d4ed8)",
                    color: "#fff",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: l ? "default" : "pointer",
                    opacity: l ? 0.85 : 1
                  },
                  children: r ? "Loading Vehicle..." : "Load Current Vehicle"
                })
              ]
            }),
            i.jsx(se, {
              status: s
            }),
            i.jsxs("form", {
              onSubmit: B,
              style: {
                ...x(),
                display: "grid",
                gap: 10
              },
              children: [
                i.jsxs("div", {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10
                  },
                  children: [
                    i.jsxs("div", {
                      children: [
                        i.jsx(b, {
                          required: true,
                          children: "Owner Name"
                        }),
                        i.jsx(y, {
                          value: t.owner_name,
                          placeholder: "Load Current Vehicle first"
                        })
                      ]
                    }),
                    i.jsxs("div", {
                      children: [
                        i.jsx(b, {
                          required: true,
                          children: "Plate"
                        }),
                        i.jsx(y, {
                          value: t.plate,
                          placeholder: "ABC123"
                        })
                      ]
                    })
                  ]
                }),
                i.jsxs("div", {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10
                  },
                  children: [
                    i.jsxs("div", {
                      children: [
                        i.jsx(b, {
                          required: true,
                          children: "Vehicle Model"
                        }),
                        i.jsx(y, {
                          value: t.vehicle_model,
                          placeholder: "Adder"
                        })
                      ]
                    }),
                    i.jsxs("div", {
                      children: [
                        i.jsx(b, {
                          children: "Vehicle Colour"
                        }),
                        i.jsx(y, {
                          value: t.vehicle_colour,
                          placeholder: "Blue / White"
                        })
                      ]
                    })
                  ]
                }),
                i.jsxs("div", {
                  children: [
                    i.jsx(b, {
                      children: "Registration Length"
                    }),
                    i.jsx(de, {
                      options: _(t.duration_options, t.duration_days),
                      selected: t.duration_days,
                      disabled: l,
                      onSelect: L
                    })
                  ]
                }),
                i.jsx("button", {
                  type: "submit",
                  disabled: l || !w,
                  style: {
                    marginTop: 2,
                    border: "1px solid rgba(16,185,129,0.35)",
                    background: n ? "linear-gradient(135deg, rgba(4,120,87,0.6), rgba(6,95,70,0.55))" : "linear-gradient(135deg, #10b981, #059669)",
                    color: "#fff",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: l || !w ? "default" : "pointer",
                    opacity: l || !w ? 0.75 : 1
                  },
                  children: n ? "Submitting..." : "Save Registration"
                })
              ]
            }),
            i.jsxs("div", {
              style: {
                ...x(),
                border: "1px solid rgba(148,163,184,0.16)",
                background: "rgba(15,23,42,0.32)",
                padding: 10,
                fontSize: 11.5,
                color: "#9fb4d1",
                lineHeight: 1.35
              },
              children: [
                "Owner name is locked to your current active character, matching the standard CAD registration form.",
                i.jsxs("div", {
                  style: {
                    marginTop: 6,
                    opacity: 0.8
                  },
                  children: [
                    "Last vehicle load: ",
                    O
                  ]
                })
              ]
            })
          ]
        })
      ]
    });
  };
});
export {
  ue as A,
  __tla,
  i as j,
  G as l
};
