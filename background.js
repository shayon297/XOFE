// background.js - Service worker with robust API integration
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";

console.log("XOFE: Background script loaded - Chrome Store Ready v2.5.0");

chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get("enabled");
  const init = enabled === undefined ? true : !!enabled;
  await chrome.storage.local.set({ enabled: init });
  chrome.action.setBadgeText({ text: init ? "ON" : "OFF" });
});

chrome.action.onClicked.addListener(async () => {
  const { enabled } = await chrome.storage.local.get("enabled");
  const next = !enabled;
  await chrome.storage.local.set({ enabled: next });
  chrome.action.setBadgeText({ text: next ? "ON" : "OFF" });
  chrome.tabs.query({ url: ["*://x.com/*", "*://twitter.com/*"] }, tabs => {
    for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: "MPT_TOGGLE", enabled: next });
  });
});

// Simple price cache
const priceCache = new Map();
const tokenCache = new Map();

// Chart data cache with TTL
const chartCache = new Map();
const chartInflightRequests = new Map();
const poolCache = new Map(); // Cache token mint → pool address mapping

// Validate base58 mint address format
function isValidMint(mint) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint);
}

// Convert human amount to minor units (u64)
function toMinorUnits(amount, decimals) {
  const multiplier = Math.pow(10, decimals);
  return Math.floor(amount * multiplier);
}

// Convert minor units back to human amount
function fromMinorUnits(minorUnits, decimals) {
  const divisor = Math.pow(10, decimals);
  return minorUnits / divisor;
}

async function getTokenMetadata(mint) {
  const now = Date.now();
  const cached = tokenCache.get(mint);
  if (cached && now - cached.ts < 300000) return cached.data; // Cache for 5 minutes

  try {
    // Try direct mint lookup first
    const directUrl = `https://token.jup.ag/all`;
    console.log("XOFE: Fetching all tokens from:", directUrl);

    const response = await fetch(directUrl);
    if (!response.ok) throw new Error(`Token metadata fetch failed: ${response.status}`);

    const data = await response.json();
    console.log("XOFE: All tokens response received, length:", data.length || 0);

    // Find the exact mint match
    const token = data.find(t => t.address === mint);
    console.log("XOFE: Found token:", token);

    if (!token) {
      console.log("XOFE: Token not found in main token list. Trying Ultra API search fallback...");
      
      // Fallback: Try Jupiter Ultra API search
      try {
        const ultraUrl = `https://ultra-api.jup.ag/search?query=${mint}`;
        console.log("XOFE: Fetching from Ultra API:", ultraUrl);
        
        const ultraResponse = await fetch(ultraUrl);
        if (ultraResponse.ok) {
          const ultraData = await ultraResponse.json();
          console.log("XOFE: Ultra API response:", ultraData);
          
          if (ultraData && ultraData.length > 0) {
            const ultraToken = ultraData[0];
            console.log("XOFE: Found token via Ultra API:", ultraToken);
            
            const result = {
              symbol: ultraToken.symbol || "Unknown",
              name: ultraToken.name || "Unknown Token",
              decimals: ultraToken.decimals || 6,
              timestamp: now
            };
            
            console.log("XOFE: Using Ultra API token metadata:", result);
            tokenCache.set(mint, { ts: now, data: result });
            return result;
          }
        }
      } catch (ultraError) {
        console.log("XOFE: Ultra API fallback failed:", ultraError);
      }
      
      // Ultimate fallback: use the mint address itself as a fallback identifier
      const fallbackSymbol = mint.slice(0, 4).toUpperCase();
      console.log("XOFE: Using ultimate fallback symbol:", fallbackSymbol);
      return {
        symbol: fallbackSymbol,
        name: `Token ${fallbackSymbol}`,
        decimals: 6, // Default to 6 decimals
        timestamp: now
      };
    }

    const result = {
      symbol: token.symbol || "Unknown",
      name: token.name || "Unknown Token",
      decimals: token.decimals || 6, // Default to 6 if unknown
      timestamp: now
    };

    console.log("XOFE: Extracted token metadata:", result);
    tokenCache.set(mint, { ts: now, data: result });
    return result;
  } catch (error) {
    console.error("XOFE: Token metadata fetch error:", error);
    // Ultimate fallback: use first 4 characters of mint as symbol
    const fallbackSymbol = mint.slice(0, 4).toUpperCase();
    console.log("XOFE: Using ultimate fallback symbol:", fallbackSymbol);
    return {
      symbol: fallbackSymbol,
      name: `Token ${fallbackSymbol}`,
      decimals: 6, // Default to 6 decimals
      timestamp: now
    };
  }
}

async function getPriceUSD(mint) {
  const now = Date.now();
  const cached = priceCache.get(mint);
  if (cached && now - cached.ts < 15000) return cached.data;

  try {
    // Get token price in USD
    const tokenUrl = `https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`;
    console.log("XOFE: Fetching token price from:", tokenUrl);

    const tokenResponse = await fetch(tokenUrl);
    if (!tokenResponse.ok) throw new Error(`Token price fetch failed: ${tokenResponse.status}`);

    const tokenData = await tokenResponse.json();
    console.log("XOFE: Token API response:", tokenData);
    console.log("XOFE: Token data for mint:", tokenData[mint]);

    // Try different possible price fields
    let tokenPriceUSD = null;
    if (tokenData[mint]?.usdPrice) {
      tokenPriceUSD = tokenData[mint].usdPrice;
      console.log("XOFE: Found usdPrice:", tokenPriceUSD);
    } else if (tokenData[mint]?.price) {
      tokenPriceUSD = tokenData[mint].price;
      console.log("XOFE: Found price:", tokenPriceUSD);
    } else {
      console.log("XOFE: No price found in token data. Available fields:", Object.keys(tokenData[mint] || {}));
      throw new Error("Token price not found in API response");
    }

    if (typeof tokenPriceUSD !== "number") {
      throw new Error("Token price is not a valid number");
    }

    // Get SOL price in USD
    const solUrl = `https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112`;
    console.log("XOFE: Fetching SOL price from:", solUrl);

    const solResponse = await fetch(solUrl);
    if (!solResponse.ok) throw new Error(`SOL price fetch failed: ${solResponse.status}`);

    const solData = await solResponse.json();
    console.log("XOFE: SOL API response:", solData);

    let solPriceUSD = null;
    if (solData["So11111111111111111111111111111111111111112"]?.usdPrice) {
      solPriceUSD = solData["So11111111111111111111111111111111111111112"].usdPrice;
      console.log("XOFE: Found SOL usdPrice:", solPriceUSD);
    } else if (solData["So11111111111111111111111111111111111111112"]?.price) {
      solPriceUSD = solData["So11111111111111111111111111111111111111112"].price;
      console.log("XOFE: Found SOL price:", solPriceUSD);
    } else {
      console.log("XOFE: No SOL price found. Available fields:", Object.keys(solData["So11111111111111111111111111111111111111112"] || {}));
      throw new Error("SOL price not found in API response");
    }

    if (typeof solPriceUSD !== "number") {
      throw new Error("SOL price is not a valid number");
    }

    // Calculate token price in SOL
    const tokenPriceSOL = tokenPriceUSD / solPriceUSD;
    console.log("XOFE: Calculated token price in SOL:", tokenPriceSOL);

    const result = {
      usdPrice: tokenPriceUSD,
      solPrice: tokenPriceSOL,
      solPriceUSD: solPriceUSD,
      timestamp: now
    };

    console.log("XOFE: Final result:", result);
    priceCache.set(mint, { ts: now, data: result });
    return result;
  } catch (error) {
    console.error("XOFE: Price fetch error:", error);
    throw error;
  }
}

// Enhanced quote function with smart fallbacks
async function getQuoteWithFallbacks(inputMint, outputMint, humanAmount, swapMode = "ExactOut", slippageBps = 100, requestId = null) {
  console.log("XOFE: Getting quote with fallbacks:", { inputMint, outputMint, humanAmount, swapMode, slippageBps, requestId });

  // 1. Validate mints
  if (!isValidMint(inputMint) || !isValidMint(outputMint)) {
    throw new Error("Invalid mint address format");
  }

  // 2. Get token metadata for decimals
  const [inputToken, outputToken] = await Promise.all([
    getTokenMetadata(inputMint),
    getTokenMetadata(outputMint)
  ]);

  console.log("XOFE: Token metadata:", { inputToken, outputToken });

  // 3. Handle amount conversion
  let amount;
  if (swapMode === "ExactOut") {
    // For ExactOut, humanAmount is in human units, convert to minor units
    amount = toMinorUnits(humanAmount, outputToken.decimals);
  } else {
    // For ExactIn, humanAmount is already in lamports (u64 string)
    amount = parseInt(humanAmount);
  }

  if (amount === 0) {
    throw new Error("Amount too small - would round to 0");
  }

  console.log("XOFE: Amount handling:", { humanAmount, amount, swapMode, decimals: swapMode === "ExactOut" ? outputToken.decimals : inputToken.decimals });

  // 4. Try primary quote (ExactIn only - no fallbacks for Buy path)
  try {
    const quote = await getQuoteInternal(inputMint, outputMint, amount.toString(), swapMode, slippageBps);
    return {
      quoteResponse: quote,
      metadata: { inputToken, outputToken, swapMode, usedFallback: false },
      requestId // Include requestId in the response
    };
  } catch (error) {
    console.log("XOFE: Quote failed:", error.message);
    throw new Error(`Quote failed: ${error.message}`);
  }
}

// Internal quote function
async function getQuoteInternal(inputMint, outputMint, amount, swapMode, slippageBps) {
  // Build URL deterministically
  const url = new URL('https://lite-api.jup.ag/swap/v1/quote');
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amount);
  url.searchParams.set('swapMode', swapMode);
  url.searchParams.set('slippageBps', slippageBps.toString());

  const fullUrl = url.toString();
  console.log("XOFE: Quote URL:", fullUrl);
  console.log("XOFE: Quote params:", { inputMint, outputMint, amount, swapMode, slippageBps });

  const response = await fetch(fullUrl);
  const responseText = await response.text();

  console.log("XOFE: Quote response status:", response.status);
  console.log("XOFE: Quote response body (first 200 chars):", responseText.substring(0, 200));

  if (!response.ok) {
    // Enhanced error logging
    console.log("XOFE: Quote failed with status:", response.status);
    console.log("XOFE: Quote failed body:", responseText);
    
    // Try to parse error JSON
    let errorMessage = `Quote request failed: ${response.status}`;
    try {
      const errorData = JSON.parse(responseText);
      if (errorData.error) {
        errorMessage = errorData.error;
        
        // Handle specific Jupiter errors
        if (errorData.error.includes("Could not find any route")) {
          errorMessage = "No route found (pool not indexed yet or illiquid)";
        }
      }
    } catch (e) {
      // If not JSON, use the raw text
      if (responseText.trim()) {
        errorMessage = responseText.trim();
      }
    }
    throw new Error(errorMessage);
  }

  // Parse successful response
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error("Quote response is not valid JSON");
  }

  if (!data || typeof data !== 'object') {
    throw new Error("Quote response is empty or invalid");
  }

  console.log("XOFE: Quote response parsed successfully:", data);
  console.log("XOFE: Quote response keys:", Object.keys(data));

  // The entire response IS the quoteResponse according to Jupiter docs
  return data;
}

async function buildSwapTransaction(quoteResponse, userPublicKey) {
  try {
    console.log("XOFE: Building swap transaction for user:", userPublicKey);
    console.log("XOFE: Quote response keys:", Object.keys(quoteResponse || {}));

    const url = "https://lite-api.jup.ag/swap/v1/swap";
    const body = {
      quoteResponse,
      userPublicKey,
      asLegacyTransaction: false,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: null
    };

    console.log("XOFE: Swap build request body:", body);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log("XOFE: Swap build failed response status:", response.status);
      console.log("XOFE: Swap build failed response body (first 200 chars):", errorText.substring(0, 200));
      
      // Try to parse error JSON for better error messages
      let errorMessage = `Swap build failed: ${response.status}`;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // If not JSON, use the raw text
        if (errorText.trim()) {
          errorMessage = `${errorMessage} - ${errorText.trim()}`;
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log("XOFE: Swap build response:", data);

    if (!data.swapTransaction) {
      throw new Error("No swap transaction in API response");
    }

    return data.swapTransaction;
  } catch (error) {
    console.error("XOFE: Swap build error:", error);
    throw error;
  }
}

// Resolve token mint to main trading pool using GeckoTerminal
async function resolveToPoolAddress(tokenMint) {
  const now = Date.now();
  const cached = poolCache.get(tokenMint);
  if (cached && now - cached.timestamp < 300000) { // 5 min cache
    console.log("[chart] Using cached pool address for", tokenMint);
    return {
      poolAddress: cached.poolAddress,
      volume24h: cached.volume24h || 0
    };
  }
  
  try {
    console.log("[chart] Resolving token to pool address via GeckoTerminal:", tokenMint);
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenMint}/pools`;
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.log("[chart] GeckoTerminal token lookup failed:", response.status);
      return null;
    }
    
    const data = await response.json();
    console.log("[chart] GeckoTerminal token pools response:", data);
    
    // Find pools with minimum liquidity and volume
    const validPools = data.data?.filter(pool => {
      const attributes = pool.attributes;
      const reserveUsd = parseFloat(attributes?.reserve_in_usd || '0');
      const volume24h = parseFloat(attributes?.volume_usd?.h24 || '0');
      
      return reserveUsd > 1000 && volume24h > 100; // Minimum thresholds
    }) || [];
    
    if (validPools.length === 0) {
      console.log("[chart] No liquid pools found for token");
      return null;
    }
    
    // Sort by reserve (liquidity) and take the most liquid pool
    validPools.sort((a, b) => {
      const reserveA = parseFloat(a.attributes?.reserve_in_usd || '0');
      const reserveB = parseFloat(b.attributes?.reserve_in_usd || '0');
      return reserveB - reserveA;
    });
    
    const mainPool = validPools[0];
    const poolAddress = mainPool.attributes.address;
    const reserveUsd = mainPool.attributes.reserve_in_usd;
    
    console.log("[chart] Selected main pool:", poolAddress, "reserve:", reserveUsd);
    
    // Cache the result with volume data
    poolCache.set(tokenMint, {
      poolAddress: poolAddress,
      volume24h: parseFloat(mainPool.attributes?.volume_usd?.h24 || '0'),
      timestamp: now
    });
    
    return {
      poolAddress: poolAddress,
      volume24h: parseFloat(mainPool.attributes?.volume_usd?.h24 || '0')
    };
    
  } catch (error) {
    console.error("[chart] Error resolving pool address:", error);
    return null;
  }
}

// GeckoTerminal 24h OHLCV chart data fetcher
async function getChartData(tokenMint, interval = 'minute', nowMs = null) {
  const cacheKey = `${tokenMint}_${interval}`;
  const now = Date.now();
  
  // Check cache first (TTL: 60 seconds)
  const cached = chartCache.get(cacheKey);
  if (cached && now - cached.timestamp < 60000) {
    console.log("[chart] Using cached data for", tokenMint);
    return cached.data;
  }
  
  // Check if request is already in flight
  if (chartInflightRequests.has(cacheKey)) {
    console.log("[chart] Request already in flight for", tokenMint);
    return chartInflightRequests.get(cacheKey);
  }
  
  // Create new request
  const requestPromise = (async () => {
    try {
      console.log("[chart] ===== GECKOTERMINAL API DEBUG =====");
      console.log("[chart] Fetching chart data for token:", tokenMint);
      
      // Step 1: Resolve token mint to pool address
      const poolData = await resolveToPoolAddress(tokenMint);
      if (!poolData || !poolData.poolAddress) {
        console.log("[chart] Could not resolve token to trading pool");
        return [];
      }
      const poolAddress = poolData.poolAddress;
      
      // Step 2: Fetch OHLCV data
      const timeTo = Math.floor((nowMs ?? Date.now()) / 1000);
      const timeFrom = timeTo - 86400; // 24h ago (86400 seconds)
      
      const ohlcvUrl = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/${interval}?aggregate=5`;
      
      console.log("[chart] Fetching OHLCV from:", ohlcvUrl);
      console.log("[chart] Time range:", { timeFrom, timeTo, duration: timeTo - timeFrom });
      
      const response = await fetch(ohlcvUrl, {
        headers: {
          'accept': 'application/json'
        }
      });
      
      console.log("[chart] Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log("[chart] GeckoTerminal error response:", errorText);
        
        if (response.status === 429) {
          console.log("[chart] Rate limited (30/min) - serving stale cache if available");
          if (cached) {
            return cached.data;
          }
        }
        if (response.status === 404) {
          console.log("[chart] Pool or OHLCV data not found");
        }
        return [];
      }
      
      const responseText = await response.text();
      console.log("[chart] Raw response text (first 200 chars):", responseText.substring(0, 200));
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("[chart] Failed to parse JSON:", e);
        return [];
      }
      
      console.log("[chart] GeckoTerminal OHLCV response structure:", {
        hasData: !!data.data,
        hasAttributes: !!data.data?.attributes,
        hasOhlcvList: !!data.data?.attributes?.ohlcv_list
      });
      
      const ohlcvList = data.data?.attributes?.ohlcv_list || [];
      
      if (!Array.isArray(ohlcvList) || ohlcvList.length === 0) {
        console.log("[chart] No OHLCV data returned");
        return [];
      }
      
      console.log("[chart] OHLCV data points:", ohlcvList.length);
      console.log("[chart] Sample OHLCV:", ohlcvList[0]);
      
      // Filter to last 24h and normalize to Array<{ t: number, p: number }>
      // GeckoTerminal OHLCV format: [timestamp, open, high, low, close, volume]
      const normalized = ohlcvList
        .filter(ohlcv => {
          const timestamp = ohlcv[0]; // Unix seconds
          return timestamp >= timeFrom && timestamp <= timeTo;
        })
        .map(ohlcv => ({
          t: ohlcv[0] * 1000, // Convert to milliseconds
          p: parseFloat(ohlcv[4]) // Use close price (index 4)
        }))
        .filter(item => item.p != null && !isNaN(item.p) && item.p > 0);
      
      console.log("[chart] Normalized data count:", normalized.length);
      if (normalized.length > 0) {
        console.log("[chart] Sample normalized item:", normalized[0]);
        console.log("[chart] Price range:", {
          min: Math.min(...normalized.map(d => d.p)),
          max: Math.max(...normalized.map(d => d.p))
        });
      }
      
      // Cache the result
      chartCache.set(cacheKey, {
        data: normalized,
        timestamp: now
      });
      
      console.log("[chart] Final result - cached", normalized.length, "data points for", tokenMint);
      console.log("[chart] ===== GECKOTERMINAL API DEBUG END =====");
      return normalized;
      
    } catch (error) {
      console.error("[chart] Error fetching chart data:", error);
      // Serve stale cache if available
      if (cached) {
        console.log("[chart] Error occurred, serving stale cache");
        return cached.data;
      }
      return [];
    } finally {
      // Remove from inflight requests
      chartInflightRequests.delete(cacheKey);
    }
  })();
  
  // Store the promise to prevent duplicate requests
  chartInflightRequests.set(cacheKey, requestPromise);
  
  return requestPromise;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log("XOFE: Background received message:", msg);
  console.log("XOFE: Message type:", msg?.type);
  
  (async () => {
    try {
      if (msg?.type === "MPT_GET_ENABLED") {
        console.log("XOFE: Handling MPT_GET_ENABLED");
        const { enabled } = await chrome.storage.local.get("enabled");
        sendResponse({ ok: true, enabled: !!enabled });
        return;
      }
      
      if (msg?.type === "MPT_GET_PRICE") {
        console.log("XOFE: Handling MPT_GET_PRICE for mint:", msg.mint);
        const priceData = await getPriceUSD(msg.mint);
        console.log("XOFE: Sending price response:", priceData);
        sendResponse({ ok: true, ...priceData });
        return;
      }
      
      if (msg?.type === "MPT_GET_TOKEN_INFO") {
        console.log("XOFE: Handling MPT_GET_TOKEN_INFO for mint:", msg.mint);
        const tokenData = await getTokenMetadata(msg.mint);
        console.log("XOFE: Sending token info response:", tokenData);
        sendResponse({ ok: true, ...tokenData });
        return;
      }

      if (msg?.type === "MPT_GET_QUOTE_EXACT_OUT") {
        console.log("XOFE: Handling MPT_GET_QUOTE_EXACT_OUT");
        const { inputMint, outputMint, outAmount, slippageBps } = msg;
        const result = await getQuoteWithFallbacks(inputMint, outputMint, outAmount, "ExactOut", slippageBps);
        console.log("XOFE: Sending quote response:", result);
        sendResponse({ ok: true, requestId: msg.requestId, ...result });
        return;
      }

      if (msg?.type === "MPT_GET_QUOTE_EXACT_IN") {
        console.log("XOFE: Handling MPT_GET_QUOTE_EXACT_IN");
        console.log("XOFE: Request ID received:", msg.requestId);
        const { inputMint, outputMint, amount, slippageBps, requestId } = msg;
        
        // For ExactIn, use direct quote (no fallbacks for Buy path)
        const result = await getQuoteInternal(inputMint, outputMint, amount, "ExactIn", slippageBps);
        console.log("XOFE: Sending quote response with requestId:", requestId);
        sendResponse({ ok: true, requestId: requestId, quoteResponse: result, metadata: { usedFallback: false } });
        return;
      }

                  if (msg?.type === "MPT_BUILD_SWAP") {
              console.log("XOFE: Handling MPT_BUILD_SWAP");
              console.log("XOFE: MPT_BUILD_SWAP message keys:", Object.keys(msg));
              
              const { quoteResponse, userPublicKey } = msg;
              
              if (!quoteResponse) {
                console.error("XOFE: MPT_BUILD_SWAP missing quoteResponse");
                sendResponse({ ok: false, error: "Missing quoteResponse" });
                return;
              }
              
              if (!userPublicKey) {
                console.error("XOFE: MPT_BUILD_SWAP missing userPublicKey");
                sendResponse({ ok: false, error: "Missing userPublicKey" });
                return;
              }
              
              console.log("XOFE: Building swap transaction for user:", userPublicKey);
              const swapTransaction = await buildSwapTransaction(quoteResponse, userPublicKey);
              console.log("XOFE: Swap transaction built successfully, length:", swapTransaction?.length || 0);
              sendResponse({ ok: true, base64: swapTransaction });
              return;
            }
            
            if (msg?.type === "MPT_GET_CHART_DATA") {
              console.log("XOFE: ===== BACKGROUND CHART HANDLER =====");
              console.log("XOFE: Handling MPT_GET_CHART_DATA for", msg.address);
              console.log("XOFE: Message details:", msg);
              
              try {
                const chartData = await getChartData(msg.address, msg.interval, msg.nowMs);
                console.log("XOFE: Chart data fetched:", chartData.length, "points");
                console.log("XOFE: Sending response back to content script");
                sendResponse({ ok: true, data: chartData });
              } catch (error) {
                console.error("XOFE: Error in chart handler:", error);
                sendResponse({ ok: false, error: error.message });
              }
              return;
            }
            
            if (msg?.type === "MPT_GET_VOLUME") {
              console.log("XOFE: Handling MPT_GET_VOLUME for", msg.address);
              
              try {
                const poolData = await resolveToPoolAddress(msg.address);
                const volume24h = poolData?.volume24h || 0;
                console.log("XOFE: Volume data fetched:", volume24h);
                sendResponse({ ok: true, volume24h: volume24h });
              } catch (error) {
                console.error("XOFE: Error in volume handler:", error);
                sendResponse({ ok: false, error: error.message, volume24h: 0 });
              }
              return;
            }
            

      
      console.log("XOFE: Unknown message type:", msg?.type);
      sendResponse({ ok: false, error: "unknown_message" });
    } catch (e) {
      console.error("XOFE: Background error:", e);
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true;
});
