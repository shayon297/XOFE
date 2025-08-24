// wallet.js - Embedded wallet functionality with Turnkey
(() => {
  console.log("XOFE: Wallet module loaded");

  let walletState = {
    isCreated: false,
    address: null,
    balance: 0,
    isInitialized: false,
    turnkeyClient: null
  };

  let turnkeySDK = null;

  // Initialize wallet module
  async function initWallet() {
    if (walletState.isInitialized) return;
    
    try {
      // Load Turnkey SDK
      await loadTurnkeySDK();
      
      // Initialize Turnkey client
      await initTurnkeyClient();
      
      // Check if wallet exists in storage
      const stored = await chrome.storage.local.get(['xofe_wallet_data']);
      if (stored.xofe_wallet_data) {
        walletState = { ...walletState, ...stored.xofe_wallet_data, isInitialized: true };
        console.log("XOFE: Existing wallet loaded");
      } else {
        walletState.isInitialized = true;
        console.log("XOFE: No existing wallet found");
      }
    } catch (error) {
      console.error("XOFE: Error initializing wallet:", error);
      walletState.isInitialized = true;
    }
  }

  // Load Turnkey SDK
  async function loadTurnkeySDK() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/turnkey.bundle.js');
      script.onload = () => {
        if (window.TurnkeySDK && window.TurnkeySDK.Turnkey) {
          turnkeySDK = window.TurnkeySDK.Turnkey;
          console.log("XOFE: Turnkey SDK loaded successfully");
          resolve();
        } else {
          reject(new Error("Turnkey SDK not found on window"));
        }
      };
      script.onerror = () => reject(new Error("Failed to load Turnkey SDK"));
      document.head.appendChild(script);
    });
  }

  // Initialize Turnkey client
  async function initTurnkeyClient() {
    if (!turnkeySDK) {
      throw new Error("Turnkey SDK not loaded");
    }

    try {
      // Your actual Turnkey configuration
      const turnkeyConfig = {
        apiBaseUrl: "https://api.turnkey.com",
        defaultOrganizationId: "7df2c24f-4185-40e7-b16b-68600a5659c8",
        rpId: window.location.hostname, // Use current domain (x.com or twitter.com)
      };

      walletState.turnkeyClient = new turnkeySDK(turnkeyConfig);
      console.log("XOFE: Turnkey client initialized");
      
    } catch (error) {
      console.error("XOFE: Failed to initialize Turnkey client:", error);
      throw error;
    }
  }

  // Create wallet using Turnkey
  async function createWallet() {
    try {
      console.log("XOFE: Creating new wallet with Turnkey...");
      
      if (!walletState.turnkeyClient) {
        throw new Error("Turnkey client not initialized");
      }

      // For now, we'll create a simulated wallet since actual Turnkey integration
      // requires proper authentication setup (passkeys, email verification, etc.)
      // In a real implementation, you would:
      // 1. Authenticate user (passkey, email, etc.)
      // 2. Create sub-organization for user
      // 3. Generate Solana wallet
      
      console.log("XOFE: Turnkey client available, creating wallet...");
      
      // Simulate Turnkey wallet creation
      // TODO: Replace with actual Turnkey API calls once authentication is set up
      const simulatedWallet = {
        address: generateSolanaAddress(), // Generate realistic Solana address
        isCreated: true,
        balance: 0,
        createdAt: Date.now(),
        turnkeySubOrgId: "sim_" + Math.random().toString(36).substr(2, 9)
      };

      walletState = { ...walletState, ...simulatedWallet };
      
      // Store wallet data
      await chrome.storage.local.set({ xofe_wallet_data: walletState });
      
      console.log("XOFE: Wallet created successfully:", walletState.address);
      return { success: true, address: walletState.address };
      
    } catch (error) {
      console.error("XOFE: Error creating wallet:", error);
      return { success: false, error: error.message };
    }
  }

  // Generate a realistic-looking Solana address
  function generateSolanaAddress() {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 44; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Get wallet status
  function getWalletStatus() {
    return {
      isCreated: walletState.isCreated,
      address: walletState.address,
      balance: walletState.balance
    };
  }

  // Fund wallet (placeholder for Coinbase Pay integration)
  async function fundWallet(amount = 10) {
    try {
      console.log("XOFE: Funding wallet with", amount, "USDC...");
      
      // TODO: Implement actual Coinbase Pay integration
      // For now, simulate funding
      walletState.balance += amount;
      
      // Update storage
      await chrome.storage.local.set({ xofe_wallet_data: walletState });
      
      console.log("XOFE: Wallet funded successfully. New balance:", walletState.balance);
      return { success: true, newBalance: walletState.balance };
      
    } catch (error) {
      console.error("XOFE: Error funding wallet:", error);
      return { success: false, error: error.message };
    }
  }

  // Export functions for content script
  window.XOFEWallet = {
    init: initWallet,
    create: createWallet,
    getStatus: getWalletStatus,
    fund: fundWallet
  };

})();
