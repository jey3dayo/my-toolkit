import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './popup/App';
import { ensurePopupUiBaseStyles } from './ui/styles';

(() => {
  const start = (): void => {
    ensurePopupUiBaseStyles(document);

    const isExtensionPage = window.location.protocol === 'chrome-extension:';
    if (isExtensionPage) {
      document.body.classList.add('is-extension');
    }

    const rootEl = document.getElementById('root');
    if (!rootEl) {
      throw new Error('Missing #root element in popup.html');
    }

    createRoot(rootEl).render(createElement(PopupApp));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
