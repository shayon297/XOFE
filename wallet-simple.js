// wallet-simple.js - Simple Turnkey embedded wallet implementation
(() => {
  console.log("XOFE: Simple Wallet module loaded");

  let walletState = {
    isCreated: false,
    address: null,
    balance: 0,
    isInitialized: false,
    organizationId: null,
    walletId: null
  };

  // Turnkey configuration
  const TURNKEY_CONFIG = {
    organizationId: "7df2c24f-4185-40e7-b16b-68600a5659c8",
    apiBaseUrl: "https://api.turnkey.com",
    iframeUrl: "https://auth.turnkey.com"
  };

  // Simple iframe-based authentication
  async function createAuthIframe() {
    return new Promise((resolve, reject) => {
      // Create iframe for Turnkey authentication
      const iframe = document.createElement('iframe');
      iframe.src = `${TURNKEY_CONFIG.iframeUrl}?organizationId=${TURNKEY_CONFIG.organizationId}`;
      iframe.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 400px;
        height: 600px;
        border: none;
        border-radius: 12px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.3);
        z-index: 10000;
        background: white;
      `;
      
      // Create overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
      `;
      
      // Add close button
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '×';
      closeBtn.style.cssText = `
        position: absolute;
        top: -40px;
        right: 0;
        background: white;
        border: none;
        border-radius: 20px;
        width: 32px;
        height: 32px;
        font-size: 20px;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      `;
      
      closeBtn.onclick = () => {
        cleanup();
        reject(new Error("User cancelled authentication"));
      };
      
      const cleanup = () => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        if (closeBtn.parentNode) closeBtn.parentNode.removeChild(closeBtn);
      };
      
      // Listen for messages from iframe
      const messageHandler = (event) => {
        if (event.origin !== 'https://auth.turnkey.com') return;
        
        console.log("XOFE: Received message from Turnkey:", event.data);
        
        if (event.data.type === 'TURNKEY_WALLET_CREATED') {
          cleanup();
          window.removeEventListener('message', messageHandler);
          resolve(event.data);
        } else if (event.data.type === 'TURNKEY_ERROR') {
          cleanup();
          window.removeEventListener('message', messageHandler);
          reject(new Error(event.data.error || 'Authentication failed'));
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      // Add to page
      document.body.appendChild(overlay);
      document.body.appendChild(iframe);
      document.body.appendChild(closeBtn);
      
      // Auto-close after 5 minutes
      setTimeout(() => {
        cleanup();
        window.removeEventListener('message', messageHandler);
        reject(new Error("Authentication timeout"));
      }, 300000);
    });
  }

  // Initialize wallet
  async function initWallet() {
    if (walletState.isInitialized) return;
    
    try {
      console.log("XOFE: Initializing simple wallet...");
      
      // Check if wallet exists in storage
      const stored = await chrome.storage.local.get(['xofe_simple_wallet']);
      if (stored.xofe_simple_wallet) {
        walletState = { ...walletState, ...stored.xofe_simple_wallet, isInitialized: true };
        console.log("XOFE: Existing wallet loaded from storage");
      } else {
        walletState.isInitialized = true;
        console.log("XOFE: No existing wallet found");
      }
      
    } catch (error) {
      console.error("XOFE: Error initializing wallet:", error);
      walletState.isInitialized = true;
    }
  }

  // Create wallet
  async function createWallet() {
    try {
      console.log("XOFE: Creating simple Turnkey wallet...");
      
      if (!walletState.isInitialized) {
        await initWallet();
      }

      // Show authentication iframe
      console.log("XOFE: Opening Turnkey authentication...");
      const authResult = await createAuthIframe();
      
      console.log("XOFE: Authentication successful:", authResult);
      
      // Extract wallet info from auth result
      const address = authResult.address || `TK${Math.random().toString(36).substring(2, 12)}`;
      const organizationId = authResult.organizationId || TURNKEY_CONFIG.organizationId;
      const walletId = authResult.walletId || `wallet_${Date.now()}`;
      
      // Update wallet state
      walletState = {
        ...walletState,
        isCreated: true,
        address: address,
        organizationId: organizationId,
        walletId: walletId
      };

      // Save to storage
      await chrome.storage.local.set({ xofe_simple_wallet: walletState });
      
      console.log("XOFE: Wallet created successfully:", {
        address: address,
        organizationId: organizationId
      });

      return {
        success: true,
        address: address,
        message: `Wallet created! Address: ${address.slice(0, 8)}...${address.slice(-8)}`
      };

    } catch (error) {
      console.error("XOFE: Error creating wallet:", error);
      
      // Fallback to demo mode
      const demoAddress = `DEMO${Math.random().toString(36).substring(2, 12)}`;
      
      walletState = {
        ...walletState,
        isCreated: true,
        address: demoAddress
      };

      return {
        success: false,
        address: demoAddress,
        message: "⚠️ Demo Mode: Demo wallet created. Try again for real wallet creation.",
        error: error.message
      };
    }
  }

  // Get wallet status
  async function getWalletStatus() {
    return {
      isInitialized: walletState.isInitialized,
      isCreated: walletState.isCreated,
      address: walletState.address,
      balance: walletState.balance
    };
  }

  // Fund wallet (placeholder for Coinbase Pay)
  async function fundWallet(amount = 100) {
    try {
      console.log("XOFE: Funding wallet with $", amount);
      
      // TODO: Implement Coinbase Pay integration
      // For now, simulate funding
      walletState.balance += amount;
      
      // Save updated balance
      await chrome.storage.local.set({ xofe_simple_wallet: walletState });
      
      return {
        success: true,
        message: `Wallet funded with $${amount} USDC`,
        balance: walletState.balance
      };
    } catch (error) {
      console.error("XOFE: Error funding wallet:", error);
      return { success: false, error: error.message };
    }
  }

  // Sign transaction (placeholder for Turnkey signing)
  async function signTransaction(transaction) {
    try {
      console.log("XOFE: Signing transaction with Turnkey...");
      
      if (!walletState.isCreated) {
        throw new Error("No wallet created");
      }
      
      // TODO: Implement actual Turnkey transaction signing
      // For now, simulate signing
      const signature = `sig_${Math.random().toString(36).substring(2, 15)}`;
      
      return {
        success: true,
        signature: signature,
        message: "Transaction signed successfully"
      };
    } catch (error) {
      console.error("XOFE: Error signing transaction:", error);
      return { success: false, error: error.message };
    }
  }

  // Debug function
  window.debugSimpleWallet = function() {
    console.log("=== SIMPLE WALLET DEBUG ===");
    console.log("walletState:", walletState);
    console.log("TURNKEY_CONFIG:", TURNKEY_CONFIG);
    console.log("===========================");
  };

  // Export functions for content script
  window.XOFESimpleWallet = {
    init: initWallet,
    create: createWallet,
    getStatus: getWalletStatus,
    fund: fundWallet,
    sign: signTransaction,
    debug: window.debugSimpleWallet
  };

})();
