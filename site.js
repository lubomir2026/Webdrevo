(() => {
  'use strict';
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Lightbox pro fotky v sekci Naše práce a strojů
  const dialog = document.querySelector('.lightbox');
  let opener;
  if (dialog) {
    const img = dialog.querySelector('img');
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-full]');
      if (!trigger) return;
      opener = trigger;
      img.src = trigger.dataset.full;
      img.alt = trigger.querySelector('img')?.alt || '';
      dialog.showModal();
    });
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => opener?.focus());
  }

  // Poptávkový formulář → Cloudflare Worker (Turnstile + e-mail)
  const form = document.getElementById('inquiry-form');
  if (!form) return;
  const status = document.getElementById('inquiry-status');
  const submit = form.querySelector('button[type="submit"]');
  const widget = document.getElementById('turnstile-widget');
  const apiBase = form.dataset.apiBase || '';
  const FALLBACK = 'Formulář je momentálně nedostupný. Zavolejte nám prosím na +420 704 099 628 nebo napište na vasenprodrevo@seznam.cz.';
  let widgetId, token = '';

  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };
  const unavailable = () => { submit.disabled = true; setStatus(FALLBACK, true); };

  async function prepare() {
    try {
      const response = await fetch(apiBase + '/api/form-config', { cache: 'no-store' });
      const config = await response.json();
      if (!response.ok || !config.sitekey) return unavailable();
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onerror = unavailable;
      script.onload = () => {
        try {
          widgetId = window.turnstile.render(widget, {
            sitekey: config.sitekey, action: 'poptavka', language: 'cs', appearance: 'interaction-only',
            callback: value => { token = value; submit.disabled = false; },
            'expired-callback': () => { token = ''; submit.disabled = true; setStatus('Ověření vypršelo, ověřte se prosím znovu.', true); },
            'error-callback': () => { token = ''; unavailable(); }
          });
        } catch { unavailable(); }
      };
      document.head.appendChild(script);
    } catch { unavailable(); }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!token) { setStatus('Chvilku strpení, probíhá ověření proti spamu.', true); return; }
    submit.disabled = true;
    setStatus('Odesílám poptávku…');
    const data = new FormData(form);
    const payload = Object.fromEntries(['name', 'email', 'phone', 'service', 'message', 'website'].map(k => [k, String(data.get(k) || '')]));
    payload.token = token;
    try {
      const response = await fetch(apiBase + '/api/poptavka', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'Zprávu se nepodařilo odeslat.');
      form.reset();
      setStatus(result.message || 'Děkujeme, poptávka byla odeslána.');
    } catch (error) {
      setStatus(error.message === 'Failed to fetch' ? 'Spojení se nezdařilo. Zkuste to prosím znovu, nebo nám zavolejte.' : error.message, true);
    } finally {
      token = '';
      if (widgetId !== undefined && window.turnstile) window.turnstile.reset(widgetId);
    }
  });

  prepare();
})();
