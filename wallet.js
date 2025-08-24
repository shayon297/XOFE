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
  let turnkeySigner = null;

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
        if (window.TurnkeySDK && window.TurnkeySDK.Turnkey && window.TurnkeySDK.TurnkeySigner) {
          turnkeySDK = window.TurnkeySDK.Turnkey;
          turnkeySigner = window.TurnkeySDK.TurnkeySigner;
          console.log("XOFE: Turnkey SDK with Solana support loaded successfully");
          resolve();
        } else {
          reject(new Error("Turnkey SDK or TurnkeySigner not found on window"));
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
        iframeUrl: "https://auth.turnkey.com",
      };

      walletState.turnkeyClient = new turnkeySDK(turnkeyConfig);
      console.log("XOFE: Turnkey client initialized with config:", turnkeyConfig);
      
    } catch (error) {
      console.error("XOFE: Failed to initialize Turnkey client:", error);
      throw error;
    }
  }

  // Authenticate user with Turnkey (using passkeys)
  async function authenticateUser() {
    try {
      console.log("XOFE: Starting Turnkey authentication...");
      
      if (!walletState.turnkeyClient) {
        throw new Error("Turnkey client not initialized");
      }

      // Get passkey client for authentication
      const passkeyClient = walletState.turnkeyClient.passkeyClient();
      
      // Try to login with existing passkey
      console.log("XOFE: Attempting passkey login...");
      const loginResult = await passkeyClient.login();
      
      console.log("XOFE: Passkey login successful:", loginResult);
      return { success: true, client: passkeyClient };
      
    } catch (error) {
      console.log("XOFE: Passkey login failed, attempting registration:", error);
      
      try {
        // If login fails, try to register a new passkey
        const passkeyClient = walletState.turnkeyClient.passkeyClient();
        
        console.log("XOFE: Creating new user with passkey...");
        const registrationResult = await passkeyClient.createUser({
          userName: "XOFE User",
          userEmail: `xofe-user-${Date.now()}@example.com` // Temporary email
        });
        
        console.log("XOFE: Passkey registration successful:", registrationResult);
        return { success: true, client: passkeyClient, isNewUser: true };
        
      } catch (registrationError) {
        console.error("XOFE: Passkey registration also failed:", registrationError);
        return { success: false, error: registrationError.message };
      }
    }
  }

  // Create wallet using Turnkey
  async function createWallet() {
    try {
      console.log("XOFE: Creating new Solana wallet with Turnkey...");
      
      if (!walletState.turnkeyClient) {
        console.log("XOFE: Turnkey client not initialized, falling back to demo mode...");
        return createDemoWallet();
      }

      console.log("XOFE: Authenticating user...");
      const authResult = await authenticateUser();
      
      if (!authResult.success) {
        console.log("XOFE: Authentication failed, falling back to demo mode");
        return createDemoWallet();
      }

      console.log("XOFE: User authenticated, creating Solana wallet...");
      const passkeyClient = authResult.client;
      
      try {
        // Create a sub-organization for the user (simplified flow)
        const subOrgName = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        console.log("XOFE: Creating sub-organization:", subOrgName);
        
        // Create wallet using authenticated passkey client
        const walletResponse = await passkeyClient.createWallet({
          walletName: `XOFE_Solana_${Date.now()}`,
          accounts: [{
            curve: "CURVE_ED25519",
            pathFormat: "PATH_FORMAT_BIP32", 
            path: "m/44'/501'/0'/0'", // Standard Solana derivation path
            addressFormat: "ADDRESS_FORMAT_SOLANA"
          }]
        });

        console.log("XOFE: Wallet creation response:", walletResponse);
        
        if (walletResponse && walletResponse.walletId) {
          const walletId = walletResponse.walletId;
          const addresses = walletResponse.addresses || [];
          const solanaAddress = addresses.find(addr => addr.format === "ADDRESS_FORMAT_SOLANA")?.address;
          
          if (solanaAddress) {
            const newWallet = {
              address: solanaAddress,
              walletId: walletId,
              isCreated: true,
              balance: 0,
              createdAt: Date.now(),
              turnkeyWalletId: walletId
            };

            walletState = { ...walletState, ...newWallet };
            
            // Store wallet data
            await chrome.storage.local.set({ xofe_wallet_data: walletState });
            
            console.log("XOFE: Real Solana wallet created successfully:", solanaAddress);
            return { success: true, address: solanaAddress };
          } else {
            throw new Error("No Solana address found in wallet response");
          }
        } else {
          throw new Error("Invalid wallet creation response");
        }
        
      } catch (turnkeyError) {
        console.log("XOFE: Turnkey API error (likely auth required):", turnkeyError);
        console.log("XOFE: Falling back to demo wallet...");
        return createDemoWallet();
      }
      
    } catch (error) {
      console.error("XOFE: Error creating wallet:", error);
      return { success: false, error: error.message };
    }
  }

  // Create a demo wallet when Turnkey isn't available
  async function createDemoWallet() {
    try {
      console.log("XOFE: Creating demo Solana wallet...");
      
      const simulatedWallet = {
        address: generateSolanaAddress(),
        isCreated: true,
        balance: 0,
        createdAt: Date.now(),
        isSimulated: true,
        note: "Demo wallet - Real Turnkey integration requires authentication setup"
      };

      walletState = { ...walletState, ...simulatedWallet };
      
      // Store wallet data
      await chrome.storage.local.set({ xofe_wallet_data: walletState });
      
      console.log("XOFE: Demo Solana wallet created:", simulatedWallet.address);
      return { 
        success: true, 
        address: simulatedWallet.address,
        isSimulated: true,
        message: "Demo wallet created. Real Turnkey integration requires authentication setup."
      };
    } catch (error) {
      console.error("XOFE: Error creating demo wallet:", error);
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
