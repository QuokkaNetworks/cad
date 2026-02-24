import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const rootNode = document.getElementById('root');
if (import.meta.env.PROD) {
  // In production, NPWD loads the federated module (npwd.config.js -> app: App).
  // Rendering the standalone index page here causes the app UI to leak outside the phone.
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.margin = '0';
  if (rootNode) rootNode.style.display = 'none';
} else if (rootNode) {
  const root = createRoot(rootNode);
  root.render(<App />);
}
