// wallet.js - Embedded wallet functionality with Turnkey
(() => {
  console.log("XOFE: Wallet module loaded");

  let walletState = {
    isCreated: false,
    address: null,
    balance: 0,
    isInitialized: false,
    subOrganizationId: null,
    walletId: null,
    userId: null
  };

  let turnkeyClient = null;
  let passkeyClient = null;

  // Turnkey configuration
  const TURNKEY_CONFIG = {
    defaultOrganizationId: "7df2c24f-4185-40e7-b16b-68600a5659c8",
    apiBaseUrl: "https://api.turnkey.com",
    rpId: window.location.hostname,
    iframeUrl: "https://auth.turnkey.com"
  };

  // Initialize wallet module
  async function initWallet() {
    if (walletState.isInitialized) return;
    
    try {
      console.log("XOFE: Starting wallet initialization...");
      
      // Load Turnkey SDK
      console.log("XOFE: Loading Turnkey SDK...");
      await loadTurnkeySDK();
      
      // Initialize Turnkey client
      console.log("XOFE: Initializing Turnkey client...");
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
      
      console.log("XOFE: Wallet initialization complete");
    } catch (error) {
      console.error("XOFE: Error initializing wallet:", error);
      // Set as initialized anyway so we can fall back to demo mode
      walletState.isInitialized = true;
    }
  }

  // Load Turnkey SDK
  async function loadTurnkeySDK() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/turnkey.bundle.js');
      script.onload = () => {
        console.log("XOFE: Turnkey bundle script loaded");
        console.log("XOFE: window.TurnkeySDK available:", !!window.TurnkeySDK);
        
        if (window.TurnkeySDK) {
          console.log("XOFE: TurnkeySDK properties:", Object.keys(window.TurnkeySDK));
          resolve();
        } else {
          reject(new Error("TurnkeySDK not found on window"));
        }
      };
      script.onerror = () => reject(new Error("Failed to load Turnkey SDK"));
      document.head.appendChild(script);
    });
  }

  // Initialize Turnkey client
  async function initTurnkeyClient() {
    if (!window.TurnkeySDK) {
      throw new Error("Turnkey SDK not loaded");
    }

    try {
      console.log("XOFE: Creating Turnkey Browser Client...");
      
      // Initialize the browser client
      turnkeyClient = new window.TurnkeySDK.TurnkeyBrowserClient({
        baseUrl: TURNKEY_CONFIG.apiBaseUrl
      });
      
      // Initialize passkey client for authentication
      passkeyClient = new window.TurnkeySDK.TurnkeyPasskeyClient({
        baseUrl: TURNKEY_CONFIG.apiBaseUrl,
        rpId: TURNKEY_CONFIG.rpId
      });
      
      console.log("XOFE: Turnkey clients created successfully");
    } catch (error) {
      console.error("XOFE: Failed to initialize Turnkey client:", error);
      throw error;
    }
  }

  // Create wallet using Turnkey
  async function createWallet() {
    try {
      console.log("XOFE: Creating new Solana wallet with Turnkey...");
      
      if (!passkeyClient) {
        throw new Error("Turnkey passkey client not initialized");
      }

      // Step 1: Get authentication credentials (email/passkey)
      console.log("XOFE: Authenticating user...");
      const authResult = await authenticateUser();
      
      if (!authResult.success) {
        throw new Error(`Authentication failed: ${authResult.error}`);
      }

      // Step 2: Create sub-organization for the user
      console.log("XOFE: Creating sub-organization...");
      const subOrgResult = await createSubOrganization(authResult);
      
      if (!subOrgResult.success) {
        throw new Error(`Sub-organization creation failed: ${subOrgResult.error}`);
      }

      // Step 3: Extract wallet details
      const { subOrganizationId, walletId, addresses } = subOrgResult;
      const solanaAddress = addresses.find(addr => addr.addressFormat === 'ADDRESS_FORMAT_SOLANA')?.address;
      
      if (!solanaAddress) {
        throw new Error("Failed to create Solana address");
      }

      // Step 4: Save wallet state
      walletState = {
        ...walletState,
        isCreated: true,
        address: solanaAddress,
        subOrganizationId: subOrganizationId,
        walletId: walletId,
        userId: authResult.userId
      };

      // Save to storage
      await chrome.storage.local.set({ xofe_wallet_data: walletState });
      
      console.log("XOFE: Wallet created successfully:", {
        address: solanaAddress,
        subOrganizationId: subOrganizationId
      });

      return {
        success: true,
        address: solanaAddress,
        message: `Wallet created successfully! Address: ${solanaAddress.slice(0, 8)}...${solanaAddress.slice(-8)}`
      };

    } catch (error) {
      console.error("XOFE: Error creating wallet:", error);
      
      // Fallback to demo mode
      const demoAddress = "DEMO" + Math.random().toString(36).substring(2, 15);
      
      walletState = {
        ...walletState,
        isCreated: true,
        address: demoAddress
      };

      return {
        success: false,
        address: demoAddress,
        message: "⚠️ Demo Mode: Demo wallet created. Real Turnkey integration requires authentication setup.",
        error: error.message
      };
    }
  }

  // Authenticate user with Turnkey
  async function authenticateUser() {
    try {
      console.log("XOFE: Starting Turnkey authentication...");
      
      // Try to create a new user with passkey
      const userName = `XOFE-User-${Date.now()}`;
      const userEmail = `xofe-user-${Date.now()}@example.com`;
      
      console.log("XOFE: Creating user with passkey:", userName);
      
      // Create user with passkey authentication
      const createUserResult = await passkeyClient.createUser({
        userName: userName,
        userEmail: userEmail
      });
      
      console.log("XOFE: User created successfully:", createUserResult);
      
      return {
        success: true,
        userId: createUserResult.userId,
        email: userEmail,
        userName: userName,
        subOrganizationId: createUserResult.subOrganizationId
      };
      
    } catch (error) {
      console.error("XOFE: Authentication failed:", error);
      
      // Try login if user already exists
      try {
        console.log("XOFE: Trying to login existing user...");
        const loginResult = await passkeyClient.login();
        
        return {
          success: true,
          userId: loginResult.userId,
          subOrganizationId: loginResult.subOrganizationId
        };
        
      } catch (loginError) {
        console.error("XOFE: Login also failed:", loginError);
        return {
          success: false,
          error: `Auth failed: ${error.message}, Login failed: ${loginError.message}`
        };
      }
    }
  }

  // Create sub-organization for user wallet
  async function createSubOrganization(authResult) {
    try {
      console.log("XOFE: Creating sub-organization for user...");
      
      console.log("XOFE: Creating wallet for sub-org:", authResult.subOrganizationId);
      
      // Create wallet in the user's sub-organization
      const walletResult = await turnkeyClient.createWallet({
        organizationId: authResult.subOrganizationId,
        walletName: "XOFE Solana Wallet",
        accounts: [{
          curve: "CURVE_ED25519",
          pathFormat: "PATH_FORMAT_BIP32", 
          path: "m/44'/501'/0'/0'",
          addressFormat: "ADDRESS_FORMAT_SOLANA"
        }]
      });
      
      console.log("XOFE: Wallet created successfully:", walletResult);
      
      return {
        success: true,
        subOrganizationId: authResult.subOrganizationId,
        walletId: walletResult.walletId,
        addresses: walletResult.addresses
      };
      
    } catch (error) {
      console.error("XOFE: Sub-organization creation failed:", error);
      return {
        success: false,
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

  // Fund wallet (placeholder for Coinbase Pay integration)
  async function fundWallet(amount = 100) {
    try {
      console.log("XOFE: Funding wallet with $", amount);
      
      // TODO: Implement Coinbase Pay integration
      // For now, simulate funding
      walletState.balance += amount;
      
      // Save updated balance
      await chrome.storage.local.set({ xofe_wallet_data: walletState });
      
      return {
        success: true,
        message: `Wallet funded with $${amount} (simulated)`,
        balance: walletState.balance
      };
    } catch (error) {
      console.error("XOFE: Error funding wallet:", error);
      return { success: false, error: error.message };
    }
  }

  // Debug function for console testing
  window.debugXOFE = function() {
    console.log("=== XOFE DEBUG INFO ===");
    console.log("walletState:", walletState);
    console.log("turnkeyClient available:", !!turnkeyClient);
    console.log("passkeyClient available:", !!passkeyClient);
    console.log("window.TurnkeySDK:", window.TurnkeySDK);
    console.log("TURNKEY_CONFIG:", TURNKEY_CONFIG);
    console.log("========================");
  };

  // Export functions for content script
  window.XOFEWallet = {
    init: initWallet,
    create: createWallet,
    getStatus: getWalletStatus,
    fund: fundWallet,
    debug: window.debugXOFE
  };

})();