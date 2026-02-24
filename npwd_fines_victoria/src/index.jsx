import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

function isCfxNuiHost() {
  try {
    const host = String(window?.location?.hostname || '').toLowerCase();
    return host.startsWith('cfx-nui-');
  } catch {
    return false;
  }
}

const rootNode = document.getElementById('root');
if (isCfxNuiHost()) {
  // NPWD loads this resource to access the remote module; do not render the app
  // into the standalone resource page or it will leak behind the phone UI.
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.margin = '0';
  if (rootNode) rootNode.style.display = 'none';
} else if (rootNode) {
  const root = createRoot(rootNode);
  root.render(<App />);
}
