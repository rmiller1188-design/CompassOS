(() => {
  const STYLE_ID = 'compass-oauth-bridge-style';
  const PANEL_ID = 'compass-oauth-bridge-panel';
  const BUTTON_ID = 'compass-oauth-bridge-button';

  function findAccessToken() {
    const preferred = [];
    const fallback = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (/^sb-.*-auth-token$/i.test(key)) preferred.push(key);
      else fallback.push(key);
    }
    for (const key of [...preferred, ...fallback]) {
      const raw = localStorage.getItem(key);
      if (!raw || raw.length > 200000) continue;
      let value;
      try { value = JSON.parse(raw); } catch { continue; }
      const token = extractToken(value, 0);
      if (token) return token;
    }
    return null;
  }

  function extractToken(value, depth) {
    if (depth > 4 || value == null) return null;
    if (typeof value === 'object') {
      if (typeof value.access_token === 'string' && value.access_token.length > 20) return value.access_token;
      if (Array.isArray(value)) {
        for (const item of value) {
          const token = extractToken(item, depth + 1);
          if (token) return token;
        }
        return null;
      }
      for (const key of ['currentSession', 'session', 'data']) {
        if (key in value) {
          const token = extractToken(value[key], depth + 1);
          if (token) return token;
        }
      }
    }
    return null;
  }

  async function api(path, options = {}) {
    const accessToken = findAccessToken();
    if (!accessToken) throw new Error('Sign in to Compass first.');
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
      cache: 'no-store',
    });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  async function connect(provider) {
    const returnPath = `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
    const params = new URLSearchParams({ provider, redirectTo: returnPath });
    const result = await api(`/api/oauth-start?${params.toString()}`);
    if (!result.authorizationUrl) throw new Error('Provider authorization URL was not returned.');
    location.assign(result.authorizationUrl);
  }

  async function loadConnections() {
    const result = await api('/api/connections');
    return Array.isArray(result.connections) ? result.connections : [];
  }

  function statusFor(provider, connections) {
    const item = connections.find((connection) => connection.provider === provider);
    if (!item) return { label: 'Not connected', tone: 'muted', action: 'Connect' };
    const expired = item.tokenExpiresAt && Date.parse(item.tokenExpiresAt) <= Date.now();
    if (item.status === 'healthy' && !expired) return { label: item.email || 'Connected', tone: 'ok', action: 'Reconnect' };
    if (item.status === 'healthy' && expired) return { label: `${item.email || 'Connected'} · refresh needed`, tone: 'warn', action: 'Reconnect' };
    if (item.status === 'reauth_required') return { label: `${item.email || 'Account'} · sign in again`, tone: 'warn', action: 'Reconnect' };
    return { label: `${item.email || 'Account'} · ${item.status || 'attention needed'}`, tone: 'warn', action: 'Reconnect' };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147483000;border:1px solid rgba(255,255,255,.14);background:#171a21;color:#f7f8fb;border-radius:999px;padding:11px 15px;font:600 13px -apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.28);cursor:pointer}
      #${PANEL_ID}{position:fixed;inset:0;z-index:2147483001;display:grid;place-items:end center;background:rgba(0,0,0,.38);backdrop-filter:blur(8px);padding:16px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,sans-serif}
      #${PANEL_ID}[hidden]{display:none}
      #${PANEL_ID} .cos-card{width:min(560px,100%);background:#171a21;color:#f7f8fb;border:1px solid rgba(255,255,255,.13);border-radius:24px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.45);margin-bottom:max(0px,env(safe-area-inset-bottom))}
      #${PANEL_ID} .cos-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
      #${PANEL_ID} h2{font-size:19px;margin:0 0 5px}#${PANEL_ID} p{font-size:12px;line-height:1.45;color:#a6adba;margin:0}
      #${PANEL_ID} .cos-close{border:0;background:transparent;color:#c8ced8;font-size:24px;line-height:1;cursor:pointer;padding:2px 4px}
      #${PANEL_ID} .cos-provider{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:14px 0;border-top:1px solid rgba(255,255,255,.09)}
      #${PANEL_ID} .cos-name{font-size:14px;font-weight:650;margin-bottom:3px}#${PANEL_ID} .cos-status{font-size:12px;color:#9da5b2}#${PANEL_ID} .cos-status.ok{color:#9fd2ad}#${PANEL_ID} .cos-status.warn{color:#e5c07b}
      #${PANEL_ID} .cos-action{border:1px solid rgba(255,255,255,.15);background:#242936;color:#fff;border-radius:12px;padding:9px 12px;font-weight:650;font-size:12px;cursor:pointer;min-width:86px}#${PANEL_ID} .cos-action:disabled{opacity:.55;cursor:wait}
      #${PANEL_ID} .cos-error{display:none;margin-top:12px;border-radius:12px;padding:10px;background:rgba(190,65,65,.14);color:#f2b7b7;font-size:12px}#${PANEL_ID} .cos-error.show{display:block}
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    ensureStyles();
    if (!document.getElementById(BUTTON_ID)) {
      const button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Accounts';
      button.setAttribute('aria-label', 'Open connected accounts');
      document.body.appendChild(button);
    }
    if (document.getElementById(PANEL_ID)) return document.getElementById(PANEL_ID);
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.innerHTML = `<div class="cos-card" role="dialog" aria-modal="true" aria-labelledby="cos-accounts-title"><div class="cos-head"><div><h2 id="cos-accounts-title">Connected accounts</h2><p>Mail, calendar, and contacts stay read-only unless you explicitly approve an outbound action.</p></div><button class="cos-close" type="button" aria-label="Close">×</button></div><div data-provider="google" class="cos-provider"><div><div class="cos-name">Google</div><div class="cos-status">Checking…</div></div><button class="cos-action" type="button">Connect</button></div><div data-provider="microsoft" class="cos-provider"><div><div class="cos-name">Microsoft 365</div><div class="cos-status">Checking…</div></div><button class="cos-action" type="button">Connect</button></div><div class="cos-error" role="status"></div></div>`;
    document.body.appendChild(panel);
    return panel;
  }

  async function refresh(panel) {
    const errorBox = panel.querySelector('.cos-error');
    errorBox.classList.remove('show');
    try {
      const connections = await loadConnections();
      for (const provider of ['google', 'microsoft']) {
        const row = panel.querySelector(`[data-provider="${provider}"]`);
        const status = statusFor(provider, connections);
        const statusNode = row.querySelector('.cos-status');
        statusNode.textContent = status.label;
        statusNode.className = `cos-status ${status.tone}`;
        row.querySelector('.cos-action').textContent = status.action;
      }
    } catch (error) {
      errorBox.textContent = error.message || 'Could not load account status.';
      errorBox.classList.add('show');
    }
  }

  function init() {
    const panel = buildPanel();
    const trigger = document.getElementById(BUTTON_ID);
    const close = panel.querySelector('.cos-close');
    trigger.addEventListener('click', async () => {
      panel.hidden = false;
      await refresh(panel);
    });
    close.addEventListener('click', () => { panel.hidden = true; });
    panel.addEventListener('click', (event) => { if (event.target === panel) panel.hidden = true; });
    for (const row of panel.querySelectorAll('[data-provider]')) {
      const provider = row.dataset.provider;
      const button = row.querySelector('.cos-action');
      button.addEventListener('click', async () => {
        const errorBox = panel.querySelector('.cos-error');
        errorBox.classList.remove('show');
        button.disabled = true;
        button.textContent = 'Opening…';
        try { await connect(provider); }
        catch (error) {
          errorBox.textContent = error.message || 'Could not start account connection.';
          errorBox.classList.add('show');
          button.disabled = false;
          await refresh(panel);
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
