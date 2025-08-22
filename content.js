// content.js - simplified version
(() => {
  const BASE58_PATTERN = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
  
  let enabled = true;
  let tooltipEl = null;
  let inpageInjected = false;
  let currentMint = null;
  let currentTokenInfo = null;
  let latestReqId = 0; // Race-safe request ID for quotes
  let debounceTimeout = null; // For debouncing input
  let lastValidQuote = null; // Store last valid quote for Buy button

  // Helper function to handle extension context invalidation
  async function safeSendMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (error.message.includes("Extension context invalidated")) {
        throw new Error("Extension reloaded - please refresh the page");
      }
      throw error; // Re-throw other errors
    }
  }

  // Native SVG sparkline chart renderer with axes
  function createSparkline(data, width = 170, height = 45) {
    if (!data || data.length === 0) {
      // Return empty chart with message
      return `
        <div style="
          width: ${width}px; 
          height: ${height}px; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          color: #666; 
          font-size: 10px; 
          border: 1px dashed #333; 
          border-radius: 4px;
          background: rgba(255,255,255,0.02);
        ">
          No chart data
        </div>
      `;
    }

    // Downsample to ~60 points if we have more data
    let chartData = data;
    if (data.length > 60) {
      const step = Math.floor(data.length / 60);
      chartData = data.filter((_, i) => i % step === 0);
    }

    if (chartData.length === 0) return createSparkline([], width, height);

    // Find price range
    const prices = chartData.map(d => d.p);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    
    // Handle flat price case
    if (priceRange === 0) {
      const y = height / 2;
      return `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
          <line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="currentColor" stroke-opacity="0.6" stroke-width="2"/>
        </svg>
      `;
    }

    // Create SVG path
    const padding = 4;
    const chartWidth = width - (padding * 2);
    const chartHeight = height - (padding * 2);
    
    let pathData = '';
    let areaData = '';
    
    chartData.forEach((point, i) => {
      const x = padding + (i / (chartData.length - 1)) * chartWidth;
      const y = padding + (1 - (point.p - minPrice) / priceRange) * chartHeight;
      
      if (i === 0) {
        pathData += `M${x},${y}`;
        areaData += `M${x},${height - padding} L${x},${y}`;
      } else {
        pathData += ` L${x},${y}`;
        areaData += ` L${x},${y}`;
      }
    });
    
    // Close area path
    const lastX = padding + chartWidth;
    areaData += ` L${lastX},${height - padding} Z`;

    // Determine color based on price direction
    const firstPrice = chartData[0].p;
    const lastPrice = chartData[chartData.length - 1].p;
    const isPositive = lastPrice >= firstPrice;
    const strokeColor = isPositive ? '#00ff00' : '#ff4444';
    const fillColor = isPositive ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 68, 68, 0.1)';

    // Format price values for axis labels
    const formatPrice = (price) => {
      if (price >= 1) return price.toFixed(4);
      if (price >= 0.001) return price.toFixed(6);
      return price.toExponential(2);
    };

    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <defs>
          <linearGradient id="sparkline-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:${strokeColor};stop-opacity:0.3"/>
            <stop offset="100%" style="stop-color:${strokeColor};stop-opacity:0"/>
          </linearGradient>
        </defs>
        
        <!-- Price axis (right side) -->
        <text x="${width - 2}" y="8" fill="currentColor" font-size="6" text-anchor="end" opacity="0.7">${formatPrice(maxPrice)}</text>
        <text x="${width - 2}" y="${height - 2}" fill="currentColor" font-size="6" text-anchor="end" opacity="0.7">${formatPrice(minPrice)}</text>
        
        <!-- Time axis (bottom) -->
        <text x="${width / 2}" y="${height - 2}" fill="currentColor" font-size="7" text-anchor="middle" opacity="0.7">24H</text>
        
        <!-- Grid lines (subtle) -->
        <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="currentColor" stroke-opacity="0.1" stroke-width="0.5"/>
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="currentColor" stroke-opacity="0.1" stroke-width="0.5"/>
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="currentColor" stroke-opacity="0.1" stroke-width="0.5"/>
        <line x1="${width - padding}" y1="${padding}" x2="${width - padding}" y2="${height - padding}" stroke="currentColor" stroke-opacity="0.1" stroke-width="0.5"/>
        
        <!-- Chart data -->
        <path d="${areaData}" fill="url(#sparkline-gradient)"/>
        <path d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  // Update slippage display
  function updateSlippageDisplay(quoteResponse) {
    const slippageEl = tooltipEl?.querySelector("#mp-slippage");
    const tradeInfoEl = tooltipEl?.querySelector("#mp-trade-info");
    
    if (!slippageEl || !tradeInfoEl) return;
    
    const priceImpact = parseFloat(quoteResponse?.priceImpactPct || '0');
    
    if (priceImpact > 0) {
      slippageEl.textContent = `slippage: ${(priceImpact * 100).toFixed(2)}%`;
      tradeInfoEl.style.display = "block";
    } else {
      slippageEl.textContent = "";
    }
  }
  
  // Fetch and display market cap
  async function fetchMarketCap(address) {
    const marketCapEl = tooltipEl?.querySelector("#mp-market-cap");
    if (!marketCapEl) return;
    
    try {
      const resp = await safeSendMessage({
        type: "MPT_GET_MARKET_CAP",
        address: address
      });
      
      if (resp?.ok && resp.marketCap > 0) {
        const marketCap = resp.marketCap;
        let formattedMarketCap;
        
        if (marketCap >= 1000000000) {
          formattedMarketCap = `(mcap: $${(marketCap / 1000000000).toFixed(1)}b)`;
        } else if (marketCap >= 1000000) {
          formattedMarketCap = `(mcap: $${(marketCap / 1000000).toFixed(1)}m)`;
        } else if (marketCap >= 1000) {
          formattedMarketCap = `(mcap: $${(marketCap / 1000).toFixed(0)}k)`;
        } else {
          formattedMarketCap = `(mcap: $${marketCap.toFixed(0)})`;
        }
        
        marketCapEl.textContent = formattedMarketCap;
      } else {
        marketCapEl.textContent = "";
      }
    } catch (error) {
      console.log("XOFE: Market cap fetch error:", error);
      marketCapEl.textContent = "";
    }
  }

  // Fetch and display 24h volume
  async function fetchVolumeData(address) {
    const volumeEl = tooltipEl?.querySelector("#mp-volume");
    const tradeInfoEl = tooltipEl?.querySelector("#mp-trade-info");
    
    if (!volumeEl || !tradeInfoEl) return;
    
    try {
      const resp = await safeSendMessage({
        type: "MPT_GET_VOLUME",
        address: address
      });
      
      if (resp?.ok && resp.volume24h > 0) {
        const volume = resp.volume24h;
        let formattedVolume;
        
        if (volume >= 1000000) {
          formattedVolume = `$${(volume / 1000000).toFixed(1)}m`;
        } else if (volume >= 1000) {
          formattedVolume = `$${(volume / 1000).toFixed(0)}k`;
        } else {
          formattedVolume = `$${volume.toFixed(0)}`;
        }
        
        volumeEl.textContent = `24h volume: ${formattedVolume}`;
        tradeInfoEl.style.display = "block";
      } else {
        volumeEl.textContent = "";
      }
    } catch (error) {
      console.log("XOFE: Volume fetch error:", error);
      volumeEl.textContent = "";
    }
  }

  // Fetch and render chart data
  async function fetchAndRenderChart(address) {
    const chartContainer = tooltipEl?.querySelector('.mp-sparkline');
    if (!chartContainer) {
      console.log("[chart] No chart container found");
      return;
    }

    try {
      console.log("[chart] ===== CHART DEBUG START =====");
      console.log("[chart] Fetching chart data for address:", address);
      console.log("[chart] Address length:", address?.length);
      console.log("[chart] Address valid:", /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address));
      
      chartContainer.innerHTML = '<div style="color:#888;font-size:11px;text-align:center;padding:18px 0;">Loading chart...</div>';
      
      console.log("[chart] Sending message to background script...");
      const response = await safeSendMessage({
        type: "MPT_GET_CHART_DATA",
        address: address,
        interval: 'minute'
      });
      console.log("[chart] Received response from background:", response);
      
      console.log("[chart] Background response:", response);
      console.log("[chart] Response ok:", response?.ok);
      console.log("[chart] Response data:", response?.data);
      console.log("[chart] Data length:", response?.data?.length);
      
      if (response?.ok && response.data && response.data.length > 0) {
        console.log("[chart] Creating sparkline with", response.data.length, "points");
        console.log("[chart] Sample data points:", response.data.slice(0, 3));
        const sparklineSvg = createSparkline(response.data);
        console.log("[chart] Generated SVG length:", sparklineSvg?.length);
        console.log("[chart] SVG preview:", sparklineSvg.substring(0, 200) + "...");
        chartContainer.innerHTML = sparklineSvg;
        console.log("[chart] Chart rendered successfully");
      } else {
        console.log("[chart] No valid data - showing empty baseline");
        console.log("[chart] Response details:", { ok: response?.ok, hasData: !!response?.data, dataLength: response?.data?.length });
        
        // Special message for specific tokens
        if (address === "CreiuhfwdWCN5mJbMJtA9bBpYQrQF2tCBuZwSPWfpump") {
          console.log("[chart] PYTHIA token detected - this token is not tracked by Birdeye");
          console.log("[chart] Try a major token like USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
        }
        
        const emptyChart = createSparkline([]);
        console.log("[chart] Empty chart HTML:", emptyChart.substring(0, 200) + "...");
        chartContainer.innerHTML = emptyChart;
      }
      console.log("[chart] ===== CHART DEBUG END =====");
      
    } catch (error) {
      console.error("[chart] Error fetching chart data:", error);
      console.error("[chart] Error stack:", error.stack);
      chartContainer.innerHTML = '<div style="color:#ff4444;font-size:11px;text-align:center;padding:18px 0;">Chart error</div>';
    }
  }

  // Convert SOL to lamports using BigInt (no float math)
  function convertSOLToLamports(solString) {
    try {
      // Handle edge cases
      if (!solString || typeof solString !== 'string') {
        throw new Error("Invalid input: must be a string");
      }
      
      // Remove whitespace and leading +
      const cleanString = solString.trim().replace(/^\+/, '');
      
      // Check for negative values
      if (cleanString.startsWith('-')) {
        throw new Error("Amount must be positive");
      }
      
      // Handle values like ".5" (treat as "0.5")
      const normalizedString = cleanString.startsWith('.') ? '0' + cleanString : cleanString;
      
      // Split on decimal point
      const parts = normalizedString.split('.');
      const integerPart = parts[0] || "0";
      let fractionalPart = parts[1] || "";
      
      // Right-pad fractional part to 9 digits, then trim to 9
      fractionalPart = fractionalPart.padEnd(9, "0").slice(0, 9);
      
      // Concatenate and convert to BigInt
      const lamportsString = integerPart + fractionalPart;
      const lamportsBigInt = BigInt(lamportsString);
      
      // Check if result is 0
      if (lamportsBigInt === 0n) {
        throw new Error("Amount too small");
      }
      
      console.log("XOFE: SOL conversion - Input:", solString, "Clean:", cleanString, "Integer:", integerPart, "Fractional:", fractionalPart, "Lamports:", lamportsBigInt.toString());
      
      return lamportsBigInt.toString();
    } catch (error) {
      console.error("XOFE: SOL conversion error:", error);
      throw error; // Re-throw to surface the error
    }
  }

  // Validate lamports string format
  function assertLamportsString(s) {
    if (!s || typeof s !== 'string' || s.length === 0) {
      throw new Error("Invalid amount");
    }
    if (!/^\d+$/.test(s)) {
      throw new Error("Invalid amount");
    }
    return s;
  }

  // Build quote URL deterministically
  function buildQuoteUrl({ inputMint, outputMint, amount, slippageBps, swapMode }) {
    const url = new URL('https://lite-api.jup.ag/swap/v1/quote');
    
    // Add parameters with exact casing and names
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', amount);
    url.searchParams.set('swapMode', swapMode);
    url.searchParams.set('slippageBps', slippageBps.toString());
    
    return url.toString();
  }

  // Validate mint address format
  function validateMintAddress(mint) {
    if (!mint || typeof mint !== 'string') {
      throw new Error("Invalid mint address");
    }
    
    const trimmed = mint.trim();
    if (trimmed.length < 32 || trimmed.length > 44) {
      throw new Error("Invalid mint address length");
    }
    
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
      throw new Error("Invalid mint address format");
    }
    
    return trimmed;
  }

  // Validate quote parameters before sending
  function validateQuoteParams(inputMint, outputMint, amount) {
    // Assert inputMint is wrapped SOL
    if (inputMint !== "So11111111111111111111111111111111111111112") {
      throw new Error("Input mint must be wrapped SOL");
    }
    
    // Assert amount is digits only
    if (!/^\d+$/.test(amount)) {
      throw new Error("Amount must be digits only");
    }
    
    // Assert outputMint is different from inputMint
    if (outputMint === inputMint) {
      throw new Error("Output mint cannot be same as input mint");
    }
    
    // Validate outputMint format
    validateMintAddress(outputMint);
    
    return true;
  }

  function formatMinorUnits(minorUnitsString, decimals) {
    try {
      const big = BigInt(minorUnitsString);
      const base = 10n ** BigInt(decimals);
      const int = big / base;
      let frac = big % base;
      
      let fracStr = frac.toString().padStart(decimals, "0");
      
      // Trim trailing zeros but keep at least 2 decimal places
      while (fracStr.length > 2 && fracStr.endsWith("0")) {
        fracStr = fracStr.slice(0, -1);
      }
      
      // Limit to 6-8 fractional digits for readability
      if (fracStr.length > 8) {
        fracStr = fracStr.slice(0, 8);
      }
      
      return `${int}.${fracStr}`;
    } catch (error) {
      console.error("XOFE: Format error:", error);
      return "Error formatting";
    }
  }

  // Test the conversion function (temporary)
  console.log("XOFE: Testing SOL conversion:");
  try {
    console.log("0.2 SOL ->", convertSOLToLamports("0.2"), "lamports");
    console.log("1.0 SOL ->", convertSOLToLamports("1.0"), "lamports");
    console.log(".5 SOL ->", convertSOLToLamports(".5"), "lamports");
    console.log("0.000000001 SOL ->", convertSOLToLamports("0.000000001"), "lamports");
    
    // Test known liquid mint for validation
    const testMint = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
    console.log("Test mint validation:", validateMintAddress(testMint));
    
    // Test URL builder
    const testUrl = buildQuoteUrl({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: testMint,
      amount: "50000000", // 0.05 SOL
      swapMode: "ExactIn",
      slippageBps: 100
    });
    console.log("Test URL builder:", testUrl);
    
    // Test quote for JUP token (known to be liquid)
    console.log("Testing quote for JUP token:");
    console.log("- This should NOT show 'no route' error");
    console.log("- If it does, the issue is with our implementation, not the token");
  } catch (error) {
    console.error("XOFE: Test conversion error:", error);
  }

  // Check if extension is enabled
  chrome.runtime.sendMessage({ type: "MPT_GET_ENABLED" }, (r) => {
    enabled = r?.enabled ?? true;
    if (enabled) bindEvents();
  });

  // Listen for toggle messages
  chrome.runtime.onMessage.addListener((m) => {
    if (m?.type === "MPT_TOGGLE") {
      enabled = !!m.enabled;
      if (enabled) {
        bindEvents();
      } else {
        unbindEvents();
        removeTooltip();
      }
    }
  });

  function bindEvents() {
    console.log("XOFE: Binding events");
    document.addEventListener("mouseup", onMouseUp, true);
    console.log("XOFE: Events bound successfully");
  }

  function unbindEvents() {
    console.log("XOFE: Unbinding events");
    document.removeEventListener("mouseup", onMouseUp, true);
  }

  function removeTooltip() {
    if (tooltipEl?.parentNode) {
      tooltipEl.parentNode.removeChild(tooltipEl);
    }
    tooltipEl = null;
    currentMint = null;
    currentTokenInfo = null;
    lastValidQuote = null; // Clear cached quote
    latestReqId = 0; // Reset request ID
    if (debounceTimeout) clearTimeout(debounceTimeout);
  }

  function onMouseUp() {
    if (!enabled) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const text = String(sel.toString()).trim();
    const match = text.match(BASE58_PATTERN);
    if (!match) return;

    const mint = match[0];
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    showTooltip(rect, mint);
  }

  function showTooltip(rect, mint) {
    removeTooltip();

    // Position tooltip near selection
    const left = Math.min(rect.left + 10, window.innerWidth - 280);
    const top = rect.bottom + 8;

    // Create sleek, minimalist tooltip
    const tooltipHTML = `
      <div id="xofe-tooltip" style="
        position: fixed;
        z-index: 999999999;
        left: ${left}px;
        top: ${top}px;
        width: 260px;
        padding: 16px;
        border-radius: 8px;
        background: #000000;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        border: 1px solid #333333;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-weight:600;font-size:14px;">
            <span id="mp-ticker">XOFE</span>
          </div>
          <button id="mp-close" style="all:unset;cursor:pointer;font-size:14px;opacity:0.7;padding:2px;">✕</button>
        </div>
        <div style="margin-bottom:8px;opacity:0.8;font-size:12px;">
          Contract: <code style="background:#333;padding:2px 4px;border-radius:3px;font-size:11px;">${shorten(mint)}</code>
        </div>
        <div id="mp-price" style="margin-bottom:12px;font-size:13px;">Fetching price...</div>
        <div class="mp-sparkline" aria-label="24h price chart (5m intervals)" style="margin-bottom:12px;width:170px;height:45px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:rgba(255,255,255,0.05);">
          <div style="color:#888;font-size:11px;">Loading chart...</div>
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;margin-bottom:4px;opacity:0.8;font-size:12px;color:#00ff00;">Market Order (SOL):</label>
          <input id="mp-sol-input" type="number" min="0" step="0.000000001" value="0.1" style="
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid #00ff00;
            background: #1a1a1a;
            color: #00ff00;
            font-size: 13px;
            box-sizing: border-box;
          ">
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;margin-bottom:4px;opacity:0.8;font-size:12px;">Receive:</label>
          <div id="mp-token-output" style="
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid #333;
            background: #1a1a1a;
            color: #ffffff;
            font-size: 13px;
            box-sizing: border-box;
            min-height: 34px;
            display: flex;
            align-items: center;
          ">
            Calculating...
          </div>
          <div id="mp-decimals-note" style="font-size:11px;opacity:0.6;margin-top:2px;display:none;">
            Assuming 6 decimals
          </div>
        </div>
        <div id="mp-trade-info" style="margin-bottom:8px;font-size:11px;opacity:0.8;display:none;">
          <div id="mp-slippage" style="margin-bottom:2px;"></div>
          <div id="mp-volume" style="margin-bottom:2px;"></div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="mp-buy" style="width:100%;padding:12px;border-radius:6px;border:0;cursor:pointer;background:#ffffff;color:#000000;font-weight:600;font-size:13px;">
            Buy
          </button>
        </div>
        <div id="mp-status" style="margin-top:8px;font-size:12px;display:none;"></div>
      </div>
    `;

    // Inject HTML directly into the page
    document.body.insertAdjacentHTML('beforeend', tooltipHTML);
    
    // Get the tooltip element
    tooltipEl = document.getElementById('xofe-tooltip');
    
    if (!tooltipEl) {
      console.error("XOFE: Failed to find tooltip element after injection!");
      return;
    }

    // Store current mint for trading
    currentMint = mint;

    // Bind close button
    tooltipEl.querySelector("#mp-close").addEventListener("click", removeTooltip);

    // Bind Buy button
    tooltipEl.querySelector("#mp-buy").addEventListener("click", handleBuy);

    // Bind input event for SOL amount first
    const solInput = tooltipEl.querySelector("#mp-sol-input");
    if (solInput) {
      solInput.addEventListener("input", (e) => {
        if (debounceTimeout) clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          const solAmount = parseFloat(e.target.value);
          if (solAmount > 0) {
            updateTokenOutput(solAmount);
          } else {
            const outputEl = tooltipEl.querySelector("#mp-token-output");
            if (outputEl) outputEl.textContent = "Enter SOL amount";
          }
        }, 200); // Debounce by 200ms
      });
    }

    // Fetch token info and price, then do initial calculation
    fetchTokenInfo(mint).then(() => {
      console.log("XOFE: Token info loaded, running initial quote calculation for default", solInput?.value, "SOL");
      // Initial calculation after token info is loaded
      if (solInput) {
        const defaultAmount = parseFloat(solInput.value);
        console.log("XOFE: Starting initial updateTokenOutput with", defaultAmount, "SOL");
        console.log("XOFE: currentTokenInfo available:", !!currentTokenInfo);
        updateTokenOutput(defaultAmount);
      }
    }).catch(error => {
      console.error("XOFE: Error in fetchTokenInfo, running initial quote anyway:", error);
      // Run initial calculation even if token info fails
      if (solInput) {
        const defaultAmount = parseFloat(solInput.value);
        console.log("XOFE: Starting fallback updateTokenOutput with", defaultAmount, "SOL");
        console.log("XOFE: currentTokenInfo available:", !!currentTokenInfo);
        updateTokenOutput(defaultAmount);
      }
    });
    fetchPrice(mint);
    
    // Fetch chart data with debounce
    setTimeout(() => {
      fetchAndRenderChart(mint);
    }, 200);
    
    // Fetch volume data
    fetchVolumeData(mint);
  }

  async function fetchTokenInfo(mint) {
    try {
      console.log("XOFE: Fetching token info for mint:", mint);
      const resp = await chrome.runtime.sendMessage({ type: "MPT_GET_TOKEN_INFO", mint });
      console.log("XOFE: Token info response:", resp);
      console.log("XOFE: Token info details - symbol:", resp?.symbol, "name:", resp?.name);
      
      if (resp?.ok && resp.symbol && resp.symbol !== "Unknown") {
        const tickerEl = tooltipEl?.querySelector("#mp-ticker");
        if (tickerEl) {
          tickerEl.textContent = `$${resp.symbol.toUpperCase()}`;
          console.log("XOFE: Updated ticker to:", resp.symbol.toUpperCase());
        } else {
          console.log("XOFE: Ticker element not found");
        }
        
        // Store token info for trading
        currentTokenInfo = resp;
        
        // Show decimals note if using fallback
        const decimalsNote = tooltipEl?.querySelector("#mp-decimals-note");
        if (decimalsNote && resp.decimals === 6) {
          decimalsNote.style.display = "block";
        }
      } else {
        console.log("XOFE: Token info not ok or symbol is Unknown/empty:", resp);
        // Use fallback: first 4 characters of mint address
        const fallbackSymbol = mint.slice(0, 4).toUpperCase();
        const tickerEl = tooltipEl?.querySelector("#mp-ticker");
        if (tickerEl) {
          tickerEl.textContent = `$${fallbackSymbol}`;
          console.log("XOFE: Using fallback ticker:", fallbackSymbol);
        }
        
        // Store fallback token info
        currentTokenInfo = { symbol: fallbackSymbol, decimals: 6 };
      }
    } catch (error) {
      console.error("XOFE: Error fetching token info:", error);
      // Ultimate fallback
      const fallbackSymbol = mint.slice(0, 4).toUpperCase();
      const tickerEl = tooltipEl?.querySelector("#mp-ticker");
      if (tickerEl) {
        tickerEl.textContent = `$${fallbackSymbol}`;
        console.log("XOFE: Using ultimate fallback ticker:", fallbackSymbol);
      }
      
      // Store ultimate fallback token info
      currentTokenInfo = { symbol: fallbackSymbol, decimals: 6 };
    }
  }

  async function fetchPrice(mint) {
    console.log("XOFE: fetchPrice called for mint:", mint);
    
    try {
      console.log("XOFE: Sending message to background script...");
      const resp = await chrome.runtime.sendMessage({ type: "MPT_GET_PRICE", mint });
      console.log("XOFE: Received response from background:", resp);
      
      const priceEl = tooltipEl?.querySelector("#mp-price");
      if (!priceEl) {
        console.log("XOFE: No price element found in tooltip");
        return;
      }

      if (resp?.ok) {
        const { usdPrice, solPrice } = resp;
        console.log("XOFE: Extracted prices - USD:", usdPrice, "SOL:", solPrice);
        
        priceEl.innerHTML = `
          <div style="margin-bottom:6px;">
            <strong>USD:</strong> $${formatUSD(usdPrice)} <span id="mp-market-cap" style="opacity:0.7;font-size:11px;"></span>
          </div>
          <div>
            <strong>SOL:</strong> ${formatSOL(solPrice)}
          </div>
        `;
        
        // Fetch market cap data
        fetchMarketCap(mint);
      } else {
        console.log("XOFE: Response not ok:", resp);
        priceEl.textContent = "Price unavailable";
      }
    } catch (error) {
      console.error("XOFE: Error in fetchPrice:", error);
      const priceEl = tooltipEl?.querySelector("#mp-price");
      if (priceEl) priceEl.textContent = "Price fetch failed";
    }
  }

  function shorten(addr) {
    return addr.length <= 10 ? addr : `${addr.slice(0,4)}…${addr.slice(-4)}`;
  }

  function formatUSD(n) {
    try { 
      // Always use decimal format (no scientific notation)
      if (n < 0.0001) {
        return n.toFixed(8); // Show 8 decimal places for very small numbers
      } else if (n < 0.01) {
        return n.toFixed(6); // Show 6 decimal places for small numbers
      } else {
        return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
      }
    } catch { 
      return String(n); 
    }
  }

  function formatSOL(n) {
    try { 
      // Always use decimal format (no scientific notation)
      if (n < 0.000001) {
        return n.toFixed(10); // Show 10 decimal places for very small numbers
      } else if (n < 0.001) {
        return n.toFixed(8); // Show 8 decimal places for small numbers
      } else {
        return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
      }
    } catch { 
      return String(n); 
    }
  }

  // Trading functionality
  async function handleBuy() {
    if (!currentMint || !currentTokenInfo) {
      showStatus("Error: Token info not loaded", "error");
      return;
    }

    const solAmountInput = tooltipEl?.querySelector("#mp-sol-input");
    if (!solAmountInput) {
      showStatus("Error: SOL input not found", "error");
      return;
    }

    const solAmount = parseFloat(solAmountInput.value);
    if (isNaN(solAmount) || solAmount <= 0) {
      showStatus("Please enter a valid SOL amount", "error");
      return;
    }

    // Convert SOL to lamports using BigInt
    let lamports;
    try {
      lamports = convertSOLToLamports(solAmount.toString());
    } catch (error) {
      showStatus(`SOL conversion failed: ${error.message}`, "error");
      return;
    }

    try {
      showStatus("Connecting to Phantom...", "info");

      // Inject inpage script if not already done
      if (!inpageInjected) {
        await injectInpageScript();
        inpageInjected = true;
      }

      // Get user's public key
      const publicKey = await getPublicKey();
      if (!publicKey) {
        showStatus("Phantom wallet not detected. Please install Phantom extension.", "error");
        return;
      }

      showStatus("Getting quote...", "info");

      // Check if we have a valid cached quote for this amount
      let quoteResult = null;
      console.log("XOFE: Buy button clicked for", solAmount, "SOL");
      console.log("XOFE: lastValidQuote exists:", !!lastValidQuote);
      console.log("XOFE: lastValidQuote amount:", lastValidQuote?.solAmount);
      
      if (lastValidQuote && lastValidQuote.solAmount === solAmount) {
        console.log("XOFE: Using cached quote for", solAmount, "SOL");
        quoteResult = lastValidQuote;
      } else {
        console.log("XOFE: Fetching fresh quote for", solAmount, "SOL (no cached quote available)");
        // Get fresh quote from Jupiter API
        quoteResult = await getQuote(solAmount);
        if (!quoteResult) {
          showStatus("Failed to get swap quote", "error");
          return;
        }
      }

      // Verify quote matches requested input exactly
      let requestedLamports;
      try {
        requestedLamports = convertSOLToLamports(solAmount.toString());
      } catch (error) {
        showStatus(`SOL conversion failed: ${error.message}`, "error");
        return;
      }
      const actualLamports = quoteResult.quoteResponse?.inAmount;
      
      if (actualLamports !== requestedLamports) {
        console.error("XOFE: Quote amount mismatch - Requested:", requestedLamports, "Actual:", actualLamports);
        showStatus("Quote amount mismatch; please retry", "error");
        return;
      }
      
      console.log("XOFE: Quote verification passed - Requested:", requestedLamports, "Actual:", actualLamports);
      
      // Enhanced logging for Buy path
      console.log("XOFE: Buy path - Raw input:", solAmountInput.value, "Lamports:", requestedLamports, "Quote inAmount:", actualLamports);
      
      // Show confirmation of exact amount to be spent
      const actualSOL = (BigInt(actualLamports) / 1000000000n);
      const actualFraction = (BigInt(actualLamports) % 1000000000n);
      const fractionStr = actualFraction.toString().padStart(9, '0').replace(/0+$/, ''); // Remove trailing zeros
      showStatus(`You will spend: ${actualSOL}.${fractionStr} SOL`, "info");

      showStatus("Building transaction...", "info");

      // Build swap transaction
      console.log("XOFE: Building swap transaction for user:", publicKey);
      console.log("XOFE: Using quote with inAmount:", quoteResult.quoteResponse?.inAmount);
      
      const swapTransaction = await buildSwap(quoteResult, publicKey);
      if (!swapTransaction) {
        showStatus("Failed to build swap transaction", "error");
        return;
      }
      
      console.log("XOFE: Swap transaction built successfully, length:", swapTransaction?.length || 0);
      console.log("XOFE: Base64 preview (first 16 chars):", swapTransaction?.substring(0, 16));

      showStatus("Signing transaction...", "info");

      // Sign and send transaction via Phantom
      const result = await signAndSendTransaction(swapTransaction);
      if (result.success) {
        showStatus(`Transaction completed! <a href="${result.explorer}" style="color:#00ff00;text-decoration:underline;cursor:pointer;" onclick="window.open('${result.explorer}', '_blank')">View on SolanaFM</a>`, "success");
      } else {
        showStatus(`Transaction failed: ${result.error}`, "error");
      }
      
    } catch (error) {
      console.error("XOFE: Buy error:", error);
      showStatus(`Error: ${error.message}`, "error");
    }
  }

  async function updateTokenOutput(solAmount) {
    try {
      console.log("XOFE: updateTokenOutput called with", solAmount, "SOL");
      console.log("XOFE: currentMint:", currentMint);
      console.log("XOFE: currentTokenInfo:", currentTokenInfo);
      
      const outputEl = tooltipEl?.querySelector("#mp-token-output");
      if (!outputEl) {
        console.log("XOFE: No output element found");
        return;
      }
      
      // Convert SOL to lamports using BigInt (no float math)
      let lamports;
      try {
        lamports = convertSOLToLamports(solAmount.toString());
      } catch (error) {
        outputEl.textContent = error.message;
        return;
      }
      
      // Generate new request ID
      const reqId = ++latestReqId;
      outputEl.textContent = "Calculating...";
      
      console.log("XOFE: Quote request", reqId, "- SOL input:", solAmount, "lamports:", lamports);
      
      // Validate all parameters
      const inputMint = "So11111111111111111111111111111111111111112";
      const outputMint = validateMintAddress(currentMint);
      
      try {
        validateQuoteParams(inputMint, outputMint, lamports);
      } catch (error) {
        outputEl.textContent = `Validation error: ${error.message}`;
        return;
      }
      
      // Build quote URL deterministically
      const quoteUrl = buildQuoteUrl({
        inputMint,
        outputMint,
        amount: lamports,
        swapMode: "ExactIn",
        slippageBps: 100
      });
      
      // Log quote attempt with all parameters
      console.log(`[QUOTE] url=${quoteUrl} inputMint=${inputMint} outputMint=${outputMint} amount=${lamports} mode=ExactIn`);
      
      // Get quote for ExactIn swap
      let resp;
      try {
        resp = await chrome.runtime.sendMessage({
          type: "MPT_GET_QUOTE_EXACT_IN",
          inputMint,
          outputMint,
          amount: lamports,
          slippageBps: 100,
          requestId: reqId
        });
      } catch (error) {
        if (error.message.includes("Extension context invalidated")) {
          outputEl.innerHTML = `
            <div style="color:#ff0000;font-weight:600;">
              ⚠️ Extension reloaded
            </div>
            <div style="opacity:0.8;font-size:11px;">
              Please refresh the page
            </div>
          `;
          console.log("XOFE: Extension context invalidated - page refresh needed");
          return;
        }
        throw error; // Re-throw other errors
      }
      
      // Only update if this is the latest request
      if (reqId !== latestReqId) {
        console.log("XOFE: Discarding stale response for request", reqId, "latest is", latestReqId);
        return;
      }
      
      // Verify this response is for our request
      if (resp.requestId !== reqId) {
        console.log("XOFE: Response requestId mismatch", resp.requestId, "vs", reqId);
        return;
      }

      if (resp?.ok && resp.quoteResponse?.outAmount) {
        const decimals = currentTokenInfo?.decimals || 6;
        const humanOutput = formatMinorUnits(resp.quoteResponse.outAmount, decimals);
        
        // Verify the quote matches our requested input exactly
        const requestedLamports = lamports;
        const actualLamports = resp.quoteResponse?.inAmount;
        
        if (actualLamports !== requestedLamports) {
          console.error("XOFE: Quote amount mismatch - Requested:", requestedLamports, "Actual:", actualLamports);
          outputEl.innerHTML = `
            <div style="color:#ff0000;font-weight:600;">
              ⚠️ Quote amount mismatch
            </div>
            <div style="opacity:0.8;font-size:11px;">
              Please retry
            </div>
          `;
          return;
        }
        
        console.log("XOFE: Quote verification passed - Requested:", requestedLamports, "Actual:", actualLamports);
        console.log("XOFE: Quote response", reqId, "- SOL input:", solAmount, "lamports:", lamports, "outAmount:", resp.quoteResponse.outAmount, "decimals:", decimals, "human:", humanOutput);
        console.log("XOFE: Full quote response for debugging:", JSON.stringify(resp.quoteResponse, null, 2));
        
        // Store valid quote for Buy button
        lastValidQuote = {
          quoteResponse: resp.quoteResponse,
          metadata: resp.metadata,
          solAmount: solAmount,
          lamports: lamports
        };
        console.log("XOFE: Stored valid quote for Buy button - amount:", solAmount, "SOL");
        
        // Simple display - no fallback logic needed
        outputEl.textContent = `${humanOutput} $${(currentTokenInfo?.symbol || "UNKNOWN").toUpperCase()}`;
        
        // Update slippage display
        updateSlippageDisplay(resp.quoteResponse);
        
        // Show decimals note if using fallback
        const decimalsNote = tooltipEl?.querySelector("#mp-decimals-note");
        if (decimalsNote && currentTokenInfo?.decimals === 6) {
          decimalsNote.style.display = "block";
          decimalsNote.textContent = "Assuming 6 decimals";
        }
      } else {
        // Show server error if available
        const errorMsg = resp?.error || "Route not available";
        console.log("XOFE: Quote failed", reqId, "- error:", errorMsg);
        outputEl.textContent = errorMsg;
      }
    } catch (error) {
      console.error("XOFE: Token output update error:", error);
      const outputEl = tooltipEl?.querySelector("#mp-token-output");
      if (outputEl) outputEl.textContent = "Error calculating";
    }
  }

  async function getQuote(solAmount) {
    try {
      console.log("XOFE: Getting quote for SOL amount:", solAmount, "SOL");
      console.log("XOFE: Current mint:", currentMint);
      
      // Convert SOL to lamports using BigInt
      let lamports;
      try {
        lamports = convertSOLToLamports(solAmount.toString());
      } catch (error) {
        throw new Error(`SOL conversion failed: ${error.message}`);
      }
      
      // Validate amount is not zero
      if (lamports === "0") {
        throw new Error("Amount too small");
      }
      
      // Validate all parameters
      const inputMint = "So11111111111111111111111111111111111111112";
      const outputMint = validateMintAddress(currentMint);
      
      try {
        validateQuoteParams(inputMint, outputMint, lamports);
      } catch (error) {
        throw new Error(`Parameter validation failed: ${error.message}`);
      }
      
      // Build quote URL deterministically
      const quoteUrl = buildQuoteUrl({
        inputMint,
        outputMint,
        amount: lamports,
        swapMode: "ExactIn",
        slippageBps: 100
      });
      
      // Generate request ID for race safety
      const reqId = ++latestReqId;
      
      // Log quote attempt with all parameters
      console.log(`[QUOTE] url=${quoteUrl} inputMint=${inputMint} outputMint=${outputMint} amount=${lamports} mode=ExactIn`);
      console.log("XOFE: About to send message to background script with type MPT_GET_QUOTE_EXACT_IN");
      
      let resp;
      try {
        resp = await chrome.runtime.sendMessage({
          type: "MPT_GET_QUOTE_EXACT_IN",
          inputMint,
          outputMint,
          amount: lamports,
          slippageBps: 100,
          requestId: reqId
        });
      } catch (error) {
        if (error.message.includes("Extension context invalidated")) {
          console.log("XOFE: Extension context invalidated during getQuote - user needs to refresh page");
          throw new Error("Extension reloaded - please refresh the page");
        }
        throw error; // Re-throw other errors
      }

      console.log("XOFE: Quote response received:", resp);

      if (resp?.ok) {
        console.log("XOFE: Quote received successfully");
        return resp;
      } else {
        throw new Error(resp?.error || "Quote failed");
      }
    } catch (error) {
      console.error("XOFE: Quote error:", error);
      throw error;
    }
  }

  async function buildSwap(quoteResult, userPublicKey) {
    try {
      console.log("XOFE: Building swap for user:", userPublicKey);
      
      let resp;
      try {
        resp = await chrome.runtime.sendMessage({
          type: "MPT_BUILD_SWAP",
          quoteResponse: quoteResult.quoteResponse,
          userPublicKey: userPublicKey
        });
      } catch (error) {
        if (error.message.includes("Extension context invalidated")) {
          throw new Error("Extension reloaded - please refresh the page and try again");
        }
        throw error; // Re-throw other errors
      }

      if (resp?.ok) {
        console.log("XOFE: Swap transaction built successfully");
        return resp.base64;
      } else {
        throw new Error(resp?.error || "Swap build failed");
      }
    } catch (error) {
      console.error("XOFE: Swap build error:", error);
      throw error;
    }
  }

  function signAndSendTransaction(base64Transaction) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Transaction signing timeout"));
      }, 30000); // 30 seconds for transaction

      const handleMessage = (event) => {
        if (event.source !== window) return;
        if (!event.data || event.data.source !== "xofe") return;

        if (event.data.type === "SIGN_OK") {
          clearTimeout(timeout);
          window.removeEventListener("message", handleMessage);
          resolve({
            success: true,
            signature: event.data.signature,
            explorer: event.data.explorer
          });
        } else if (event.data.type === "SIGN_ERR") {
          clearTimeout(timeout);
          window.removeEventListener("message", handleMessage);
          resolve({
            success: false,
            error: event.data.error
          });
        }
      };

      window.addEventListener("message", handleMessage);
      window.postMessage({
        source: "xofe",
        type: "REQ_SIGN_SEND",
        base64: base64Transaction
      }, "*");
    });
  }

  function getPublicKey() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Phantom connection timeout"));
      }, 2000);

      const handleMessage = (event) => {
        console.log("XOFE: Window message received:", event.data);
        if (event.source !== window) return;
        if (!event.data || event.data.source !== "xofe") return;

        console.log("XOFE: Processing xofe message:", event.data.type);
        if (event.data.type === "PUBKEY_OK") {
          clearTimeout(timeout);
          window.removeEventListener("message", handleMessage);
          console.log("XOFE: Resolving with public key:", event.data.publicKey);
          resolve(event.data.publicKey);
        } else if (event.data.type === "PUBKEY_ERR") {
          clearTimeout(timeout);
          window.removeEventListener("message", handleMessage);
          console.log("XOFE: Rejecting with error:", event.data.error);
          reject(new Error(event.data.error));
        }
      };

      window.addEventListener("message", handleMessage);
      window.postMessage({
        source: "xofe",
        type: "REQ_PUBKEY"
      }, "*");
    });
  }

  async function injectInpageScript() {
    return new Promise((resolve, reject) => {
      // Inject web3.js first
      const web3Script = document.createElement('script');
      web3Script.src = chrome.runtime.getURL('lib/web3.iife.min.js');
      web3Script.onload = () => {
        // Then inject inpage.js
        const inpageScript = document.createElement('script');
        inpageScript.src = chrome.runtime.getURL('inpage.js');
        inpageScript.onload = () => {
          console.log("XOFE: Inpage scripts injected successfully");
          resolve();
        };
        inpageScript.onerror = reject;
        document.head.appendChild(inpageScript);
      };
      web3Script.onerror = reject;
      document.head.appendChild(web3Script);
    });
  }





  function showStatus(message, type = "info") {
    const statusEl = tooltipEl?.querySelector("#mp-status");
    if (!statusEl) {
      console.error("XOFE: Status element not found in tooltip");
      return;
    }

    statusEl.innerHTML = message;
    statusEl.style.display = "block";
    statusEl.style.color = type === "success" ? "#00ff00" : type === "error" ? "#ff0000" : "#ffffff";
    statusEl.style.fontWeight = "bold";
    statusEl.style.marginBottom = "8px";
    statusEl.style.padding = "8px";
    statusEl.style.borderRadius = "6px";
    statusEl.style.backgroundColor = type === "success" ? "#003300" : type === "error" ? "#330000" : "#001133";
    statusEl.style.border = `1px solid ${type === "success" ? "#005500" : type === "error" ? "#550000" : "#003355"}`;
    statusEl.style.boxShadow = `0 2px 8px rgba(0,0,0,0.2)`;
    statusEl.style.backdropFilter = "blur(5px)";
    statusEl.style.display = "block";
  }

  // Initialize embedded wallet
  async function initializeWallet() {
    try {
      // Initialize wallet module
      if (window.XOFEWallet) {
        await window.XOFEWallet.init();
        console.log("XOFE: Wallet module initialized");
        
        // Inject wallet UI into X sidebar
        injectWalletUI();
      }
    } catch (error) {
      console.error("XOFE: Error initializing wallet:", error);
    }
  }

  // Inject wallet tab into X sidebar
  function injectWalletUI() {
    // Find X's navigation sidebar
    const sidebar = document.querySelector('[aria-label="Primary Navigation"]') || 
                   document.querySelector('nav[role="navigation"]') ||
                   document.querySelector('[data-testid="sidebarColumn"]');
    
    if (!sidebar) {
      console.log("XOFE: Sidebar not found, retrying in 2s...");
      setTimeout(injectWalletUI, 2000);
      return;
    }

    // Check if wallet tab already exists
    if (document.getElementById('xofe-wallet-tab')) {
      return;
    }

    console.log("XOFE: Injecting wallet tab into sidebar");

    // Create wallet tab element
    const walletTab = document.createElement('div');
    walletTab.id = 'xofe-wallet-tab';
    walletTab.innerHTML = `
      <div style="
        padding: 12px 16px;
        margin: 4px 0;
        border-radius: 24px;
        cursor: pointer;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
        color: rgb(231, 233, 234);
        font-size: 20px;
        font-weight: 400;
        line-height: 24px;
        min-height: 56px;
      " 
      onmouseover="this.style.backgroundColor='rgba(231, 233, 234, 0.1)'"
      onmouseout="this.style.backgroundColor='transparent'"
      onclick="window.showXOFEWallet()">
        <div style="
          width: 26.25px;
          height: 26.25px;
          margin-right: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(45deg, #00ff00, #ffff00);
          border-radius: 6px;
          font-size: 14px;
          font-weight: bold;
          color: #000;
        ">₿</div>
        <span>Wallet</span>
      </div>
    `;

    // Find the best insertion point in sidebar
    const navItems = sidebar.querySelector('nav') || sidebar;
    const firstNavItem = navItems.querySelector('a') || navItems.firstElementChild;
    
    if (firstNavItem) {
      firstNavItem.parentNode.insertBefore(walletTab, firstNavItem.nextSibling);
    } else {
      navItems.appendChild(walletTab);
    }

    console.log("XOFE: Wallet tab injected successfully");
  }

  // Show wallet interface
  window.showXOFEWallet = function() {
    console.log("XOFE: Opening wallet interface");
    showWalletModal();
  };

  // Create and show wallet modal
  function showWalletModal() {
    // Remove existing modal if present
    const existing = document.getElementById('xofe-wallet-modal');
    if (existing) {
      existing.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'xofe-wallet-modal';
    modal.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      " onclick="this.remove()">
        <div style="
          background: rgb(21, 32, 43);
          border-radius: 16px;
          padding: 24px;
          width: 400px;
          max-width: 90vw;
          max-height: 80vh;
          overflow-y: auto;
          color: rgb(231, 233, 234);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        " onclick="event.stopPropagation()">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <h2 style="margin: 0; font-size: 24px; font-weight: 700;">XOFE Wallet</h2>
            <button onclick="document.getElementById('xofe-wallet-modal').remove()" style="
              background: none;
              border: none;
              color: rgb(231, 233, 234);
              font-size: 24px;
              cursor: pointer;
              opacity: 0.7;
            ">×</button>
          </div>
          
          <div id="wallet-content">
            <div style="text-align: center; padding: 20px;">
              <div style="margin-bottom: 16px;">
                <div style="font-size: 48px; margin-bottom: 8px;">💼</div>
                <h3 style="margin: 0 0 8px 0;">No Wallet Found</h3>
                <p style="margin: 0; opacity: 0.7; font-size: 14px;">Create a secure wallet to start trading</p>
              </div>
              
              <button id="create-wallet-btn" style="
                background: linear-gradient(45deg, #00ff00, #ffff00);
                color: #000;
                border: none;
                padding: 12px 24px;
                border-radius: 24px;
                font-weight: 600;
                cursor: pointer;
                margin: 8px;
                width: 100%;
                font-size: 16px;
              ">Create Wallet</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    
    // Bind wallet actions
    bindWalletActions();
  }

  // Bind wallet button actions
  function bindWalletActions() {
    const createBtn = document.getElementById('create-wallet-btn');
    if (createBtn) {
      createBtn.addEventListener('click', handleCreateWallet);
    }
  }

  // Handle wallet creation
  async function handleCreateWallet() {
    const createBtn = document.getElementById('create-wallet-btn');
    if (createBtn) {
      createBtn.textContent = 'Creating...';
      createBtn.disabled = true;
    }

    try {
      const result = await window.XOFEWallet.create();
      
      if (result.success) {
        console.log("XOFE: Wallet created:", result.address);
        showWalletDashboard(result.address);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("XOFE: Wallet creation failed:", error);
      if (createBtn) {
        createBtn.textContent = 'Create Wallet';
        createBtn.disabled = false;
      }
      alert('Wallet creation failed: ' + error.message);
    }
  }

  // Show wallet dashboard after creation
  function showWalletDashboard(address) {
    const content = document.getElementById('wallet-content');
    if (!content) return;

    content.innerHTML = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 32px; margin-bottom: 8px;">✅</div>
        <h3 style="margin: 0 0 8px 0;">Wallet Created!</h3>
        <p style="margin: 0; opacity: 0.7; font-size: 12px; word-break: break-all;">${address}</p>
      </div>
      
      <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>USDC Balance:</span>
          <span style="font-weight: 600;">$0.00</span>
        </div>
        <div style="display: flex; justify-content: space-between; opacity: 0.7; font-size: 14px;">
          <span>Portfolio Value:</span>
          <span>$0.00</span>
        </div>
      </div>
      
      <button id="fund-wallet-btn" style="
        background: #1d9bf0;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 24px;
        font-weight: 600;
        cursor: pointer;
        margin: 4px 0;
        width: 100%;
        font-size: 16px;
      ">Fund with USDC</button>
      
      <button onclick="alert('Portfolio view coming soon!')" style="
        background: transparent;
        color: rgb(231, 233, 234);
        border: 1px solid rgba(231, 233, 234, 0.3);
        padding: 12px 24px;
        border-radius: 24px;
        font-weight: 600;
        cursor: pointer;
        margin: 4px 0;
        width: 100%;
        font-size: 16px;
      ">View Portfolio</button>
    `;

    // Bind fund wallet action
    const fundBtn = document.getElementById('fund-wallet-btn');
    if (fundBtn) {
      fundBtn.addEventListener('click', handleFundWallet);
    }
  }

  // Handle wallet funding
  async function handleFundWallet() {
    const fundBtn = document.getElementById('fund-wallet-btn');
    if (fundBtn) {
      fundBtn.textContent = 'Funding...';
      fundBtn.disabled = true;
    }

    try {
      // For now, simulate funding
      const result = await window.XOFEWallet.fund(10);
      
      if (result.success) {
        console.log("XOFE: Wallet funded, new balance:", result.newBalance);
        alert(`Wallet funded with $10 USDC! New balance: $${result.newBalance}`);
        
        // Update the balance display
        const balanceEl = document.querySelector('#wallet-content [style*="font-weight: 600"]');
        if (balanceEl) {
          balanceEl.textContent = `$${result.newBalance.toFixed(2)}`;
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("XOFE: Wallet funding failed:", error);
      alert('Wallet funding failed: ' + error.message);
    } finally {
      if (fundBtn) {
        fundBtn.textContent = 'Fund with USDC';
        fundBtn.disabled = false;
      }
    }
  }

  // Initialize wallet functionality when content script loads
  setTimeout(initializeWallet, 2000);

})();
