// content.js - Clean XOFE tooltip for Solana token trading
(() => {
  const BASE58_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

  let enabled = true;
  let tooltipEl = null;
  let dismissHandlersBound = false;

  // Ask background if enabled
  chrome.runtime.sendMessage({ type: "MPT_GET_ENABLED" }, (resp) => {
    enabled = resp?.enabled ?? true;
    if (enabled) bindSelection();
  });

  // react to toolbar toggle
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "MPT_TOGGLE") {
      enabled = !!msg.enabled;
      if (enabled) {
        bindSelection();
      } else {
        unbindSelection();
        removeTooltip();
      }
    }
  });

  function bindSelection() {
    document.addEventListener("mouseup", onMouseUp, true);
    if (!dismissHandlersBound) {
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("scroll", removeTooltip, true);
      document.addEventListener("click", onDocClick, true);
      dismissHandlersBound = true;
    }
  }
  function unbindSelection() {
    document.removeEventListener("mouseup", onMouseUp, true);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") removeTooltip();
  }
  function onDocClick(e) {
    if (tooltipEl && !tooltipEl.contains(e.target)) removeTooltip();
  }

  function removeTooltip() {
    if (tooltipEl?.parentNode) tooltipEl.parentNode.removeChild(tooltipEl);
    tooltipEl = null;
  }

  function onMouseUp(e) {
    if (!enabled) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const text = String(sel.toString()).trim();
    const match = text.match(BASE58_RE);
    if (!match) return;
    const mint = match[0];

    // Position near selection
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    showTooltip(rect, mint);
  }

  function showTooltip(rect, mint) {
    removeTooltip();

    tooltipEl = document.createElement("div");
    tooltipEl.setAttribute("data-xofe", "1");
    tooltipEl.style.position = "fixed";
    tooltipEl.style.zIndex = "2147483647";
    tooltipEl.style.left = Math.min(rect.left + 10, window.innerWidth - 380) + "px";
    tooltipEl.style.top = (rect.bottom + 8) + "px";
    tooltipEl.style.width = "360px";
    tooltipEl.style.padding = "16px";
    tooltipEl.style.borderRadius = "16px";
    tooltipEl.style.boxShadow = "0 12px 32px rgba(0,0,0,0.3)";
    tooltipEl.style.background = "linear-gradient(135deg, #0f1419 0%, #1a2332 100%)";
    tooltipEl.style.color = "#e6ecf0";
    tooltipEl.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    tooltipEl.style.fontSize = "14px";
    tooltipEl.style.lineHeight = "1.4";
    tooltipEl.style.backdropFilter = "blur(10px)";
    tooltipEl.style.border = "1px solid rgba(29, 155, 240, 0.3)";
    tooltipEl.style.animation = "xofe-slide-in 0.2s ease-out";

    // Add CSS animation
    if (!document.querySelector('#xofe-animations')) {
      const style = document.createElement('style');
      style.id = 'xofe-animations';
      style.textContent = \`
        @keyframes xofe-slide-in {
          from { opacity: 0; transform: translateY(-10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      \`;
      document.head.appendChild(style);
    }

    tooltipEl.innerHTML = \`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-weight:700;font-size:16px;color:#1d9bf0;">XOFE</div>
        <button id="xofe-close" style="all:unset;cursor:pointer;font-size:14px;opacity:.7;padding:4px;">✕</button>
      </div>
      
      <div style="margin-bottom:12px;opacity:.85;font-size:12px;">
        Token: <code style="font-size:11px;background:rgba(29,155,240,0.1);padding:2px 6px;border-radius:4px;">\${shorten(mint)}</code>
      </div>
      
      <div id="xofe-token-info" style="margin-bottom:12px;min-height:20px;">
        <div style="opacity:.7;">Loading token info...</div>
      </div>
      
      <div id="xofe-price" style="margin-bottom:12px;min-height:24px;">
        <div style="opacity:.7;">Fetching price...</div>
      </div>
      
      <div id="xofe-chart" style="margin-bottom:16px;height:60px;position:relative;background:rgba(0,0,0,0.2);border-radius:8px;overflow:hidden;">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:.6;font-size:12px;">Chart loading...</div>
      </div>
      
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <label style="opacity:.85;font-size:13px;min-width:80px;">Amount (USDC)</label>
        <input id="xofe-amt" type="number" min="0" value="100" step="1" 
               style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(29,155,240,0.3);
                      background:rgba(15,20,25,0.8);color:#e6ecf0;font-size:13px;">
      </div>
      
      <div style="display:flex;gap:10px;margin-bottom:12px;">
        <button id="xofe-buy" style="flex:1;padding:12px;border-radius:10px;border:0;cursor:pointer;
                                     background:linear-gradient(135deg, #1d9bf0 0%, #1a8cd8 100%);
                                     color:white;font-weight:600;font-size:14px;transition:all 0.2s;">
          Buy via Phantom
        </button>
        <button id="xofe-sell" style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(29,155,240,0.4);
                                      background:rgba(29,155,240,0.1);color:#1d9bf0;cursor:pointer;
                                      font-weight:600;font-size:14px;transition:all 0.2s;">
          Sell via Phantom
        </button>
      </div>
      
      <div id="xofe-stats" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:12px;">
        <div style="opacity:.7;">24h Volume: <span id="xofe-volume">--</span></div>
        <div style="opacity:.7;">Market Cap: <span id="xofe-mcap">--</span></div>
      </div>
      
      <div id="xofe-err" style="margin-top:8px;color:#ff6b6b;display:none;font-size:13px;"></div>
    \`;

    document.body.appendChild(tooltipEl);
    
    // Event handlers and button setup...
    loadTokenData(mint);
    loadPriceData(mint);
    loadChartData(mint);
    loadStatsData(mint);

    // Wire buttons to Jupiter Terminal
    tooltipEl.querySelector("#xofe-buy").addEventListener("click", () => {
      const amt = Number(tooltipEl.querySelector("#xofe-amt").value);
      if (amt <= 0) return;
      const url = \`https://jup.ag/swap/\${USDC_MINT}-\${mint}?amount=\${amt}\`;
      window.open(url, "_blank");
      removeTooltip();
    });

    tooltipEl.querySelector("#xofe-sell").addEventListener("click", () => {
      const amt = Number(tooltipEl.querySelector("#xofe-amt").value);
      if (amt <= 0) return;
      const url = \`https://jup.ag/swap/\${mint}-\${USDC_MINT}?amount=\${amt}\`;
      window.open(url, "_blank");
      removeTooltip();
    });

    tooltipEl.querySelector("#xofe-close").addEventListener("click", removeTooltip);
  }

  // Load token metadata
  function loadTokenData(mint) {
    chrome.runtime.sendMessage({ type: "MPT_GET_TOKEN_INFO", mint }, (resp) => {
      const infoEl = tooltipEl?.querySelector("#xofe-token-info");
      if (!tooltipEl || !infoEl) return;
      
      if (!resp?.ok) {
        infoEl.innerHTML = '<div style="opacity:.6;">Token info unavailable</div>';
        return;
      }
      
      const symbol = resp.symbol?.toUpperCase() || 'UNKNOWN';
      const name = resp.name || 'Unknown Token';
      
      infoEl.innerHTML = \`
        <div style="font-weight:600;font-size:15px;color:#1d9bf0;">\${symbol}</div>
        <div style="opacity:.7;font-size:12px;">\${name}</div>
      \`;
    });
  }

  // Load price data
  function loadPriceData(mint) {
    chrome.runtime.sendMessage({ type: "MPT_GET_PRICE", mint }, (resp) => {
      const priceEl = tooltipEl?.querySelector("#xofe-price");
      if (!tooltipEl || !priceEl) return;
      
      if (!resp?.ok) {
        priceEl.innerHTML = '<div style="opacity:.6;">Price unavailable</div>';
        return;
      }
      
      const usdPrice = resp.usdPrice;
      const solPrice = resp.solPrice;
      
      priceEl.innerHTML = \`
        <div>
          <div style="font-weight:600;font-size:16px;">$\${usdPrice.toLocaleString()}</div>
          <div style="opacity:.7;font-size:12px;">\${solPrice.toLocaleString()} SOL</div>
        </div>
      \`;
    });
  }

  // Load chart and stats data
  function loadChartData(mint) {
    chrome.runtime.sendMessage({ type: "MPT_GET_CHART_DATA", address: mint, interval: 'minute' }, (resp) => {
      const chartEl = tooltipEl?.querySelector("#xofe-chart");
      if (!tooltipEl || !chartEl) return;
      
      if (!resp?.ok || !resp.data || resp.data.length === 0) {
        chartEl.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:.5;font-size:11px;">No chart data</div>';
        return;
      }
      
      // Simple line chart render would go here
      chartEl.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:.8;font-size:11px;">Chart: ' + resp.data.length + ' points</div>';
    });
  }

  function loadStatsData(mint) {
    chrome.runtime.sendMessage({ type: "MPT_GET_VOLUME", address: mint }, (resp) => {
      const volumeEl = tooltipEl?.querySelector("#xofe-volume");
      if (!tooltipEl || !volumeEl) return;
      volumeEl.textContent = resp?.ok && resp.volume24h ? resp.volume24h.toLocaleString() : "--";
    });
    
    chrome.runtime.sendMessage({ type: "MPT_GET_MARKET_CAP", address: mint }, (resp) => {
      const mcapEl = tooltipEl?.querySelector("#xofe-mcap");
      if (!tooltipEl || !mcapEl) return;
      mcapEl.textContent = resp?.ok && resp.marketCap ? resp.marketCap.toLocaleString() : "--";
    });
  }

  function shorten(addr) {
    return addr.length <= 10 ? addr : \`\${addr.slice(0,4)}…\${addr.slice(-4)}\`;
  }
})();
