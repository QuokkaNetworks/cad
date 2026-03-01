import { j as o, l as a, A as t, __tla as __tla_0 } from "./App-BDaRxse7.js";
import { importShared as c, __tla as __tla_1 } from "./__federation_fn_import-C_7gNWqI.js";
let f, d;
let __tla = Promise.all([
  (() => {
    try {
      return __tla_0;
    } catch {
    }
  })(),
  (() => {
    try {
      return __tla_1;
    } catch {
    }
  })()
]).then(async () => {
  await c("react");
  let i;
  i = () => o.jsx("img", {
    src: a,
    alt: "VicRoads",
    style: {
      width: 22,
      height: 22,
      objectFit: "contain",
      borderRadius: 4,
      background: "#ffffff",
      padding: 1,
      display: "block"
    }
  });
  d = "/cad-vicroads";
  f = () => ({
    id: "CAD_VICROADS",
    path: d,
    nameLocale: "VicRoads",
    color: "#ffffff",
    backgroundColor: "#0a3d91",
    icon: i,
    app: t
  });
});
export {
  __tla,
  f as default,
  d as path
};
