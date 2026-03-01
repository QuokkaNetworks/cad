import { j as o, l as i, A as a, __tla as __tla_0 } from "./App-BF_biIMD.js";
import { importShared as t, __tla as __tla_1 } from "./__federation_fn_import-C_7gNWqI.js";
let p, r;
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
  await t("react");
  let c;
  c = () => o.jsx("img", {
    src: i,
    alt: "Fines Victoria",
    style: {
      width: 22,
      height: 22,
      objectFit: "contain",
      borderRadius: 6,
      background: "#fff8df",
      padding: 1,
      display: "block"
    }
  });
  r = "/cad-fines-victoria";
  p = () => ({
    id: "CAD_FINES_VICTORIA",
    path: r,
    nameLocale: "Fines Victoria",
    color: "#1b1300",
    backgroundColor: "#f5c84c",
    icon: c,
    app: a
  });
});
export {
  __tla,
  p as default,
  r as path
};
