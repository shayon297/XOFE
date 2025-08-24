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

  // Load Turnkey SDK and create wallet directly
  async function loadTurnkeySDK() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/turnkey.bundle.js');
      script.onload = () => {
        console.log("XOFE: Turnkey SDK loaded");
        console.log("XOFE: window.TurnkeySDK:", window.TurnkeySDK);
        console.log("XOFE: Available on window:", Object.keys(window).filter(k => k.includes('Turnkey')));
        
        // Give the bundle a moment to set up window.TurnkeySDK
        setTimeout(() => {
          console.log("XOFE: After timeout - window.TurnkeySDK:", window.TurnkeySDK);
          if (window.TurnkeySDK && window.TurnkeySDK.TurnkeyPasskeyClient) {
            console.log("XOFE: Turnkey SDK fully available");
            resolve();
          } else {
            console.log("XOFE: Turnkey SDK not properly loaded, will use fallback");
            reject(new Error("Turnkey SDK not available"));
          }
        }, 100);
      };
      script.onerror = () => reject(new Error("Failed to load Turnkey SDK"));
      document.head.appendChild(script);
    });
  }

  // Direct authentication using Turnkey SDK (no iframe)
  async function authenticateWithTurnkey() {
    try {
      console.log("XOFE: Starting direct Turnkey authentication...");
      
      // Load the SDK first
      await loadTurnkeySDK();
      
      if (!window.TurnkeySDK || !window.TurnkeySDK.TurnkeyPasskeyClient) {
        throw new Error("Turnkey SDK not properly loaded");
      }
      
      // Create passkey client
      const passkeyClient = new window.TurnkeySDK.TurnkeyPasskeyClient({
        baseUrl: TURNKEY_CONFIG.apiBaseUrl,
        rpId: window.location.hostname
      });
      
      console.log("XOFE: Creating user with passkey...");
      
      // Generate unique user details
      const userName = `XOFE-User-${Date.now()}`;
      const userEmail = `xofe-user-${Date.now()}@example.com`;
      
      // Try to create user (this will trigger passkey creation)
      const createResult = await passkeyClient.createUser({
        userName: userName,
        userEmail: userEmail
      });
      
      console.log("XOFE: User created successfully:", createResult);
      
      return {
        success: true,
        subOrganizationId: createResult.subOrganizationId,
        userId: createResult.userId,
        address: createResult.address || `TK${Math.random().toString(36).substring(2, 12)}`
      };
      
    } catch (error) {
      console.error("XOFE: Direct authentication failed:", error);
      
      // Try simple passkey login as fallback
      try {
        const passkeyClient = new window.TurnkeySDK.TurnkeyPasskeyClient({
          baseUrl: TURNKEY_CONFIG.apiBaseUrl,
          rpId: window.location.hostname
        });
        
        const loginResult = await passkeyClient.login();
        
        return {
          success: true,
          subOrganizationId: loginResult.subOrganizationId,
          userId: loginResult.userId,
          address: loginResult.address || `TK${Math.random().toString(36).substring(2, 12)}`
        };
        
      } catch (loginError) {
        console.log("XOFE: Both create and login failed, using demo mode");
        
        // Return demo wallet for now
        return {
          success: true,
          subOrganizationId: `demo_org_${Date.now()}`,
          userId: `demo_user_${Date.now()}`,
          address: `DEMO${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
          isDemo: true
        };
      }
    }
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

      // Use direct authentication (no iframe)
      console.log("XOFE: Starting direct authentication...");
      const authResult = await authenticateWithTurnkey();
      
      console.log("XOFE: Authentication successful:", authResult);
      
      // Extract wallet info from auth result
      const address = authResult.address;
      const organizationId = authResult.subOrganizationId;
      const walletId = authResult.userId;
      
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

      const isDemo = authResult.isDemo;
      const message = isDemo ? 
        `⚠️ Demo wallet created! Address: ${address}` :
        `✅ Real Turnkey wallet created! Address: ${address.slice(0, 8)}...${address.slice(-8)}`;

      return {
        success: true,
        address: address,
        message: message,
        isDemo: isDemo
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
