import { importShared as e, __tla as __tla_0 } from "./__federation_fn_import-C_7gNWqI.js";
import { __tla as __tla_1 } from "./App-CGQhx6HP.js";
import { r } from "./index-BRrI07Qo.js";
Promise.all([
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
  var t = r;
  t.createRoot, t.hydrateRoot;
  await e("react");
  const o = document.getElementById("root");
  document.documentElement.style.background = "transparent", document.body.style.background = "transparent", document.body.style.margin = "0", o && (o.style.display = "none");
});
