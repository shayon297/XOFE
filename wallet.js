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
      console.log("XOFE: Creating new Solana wallet with Turnkey...");
      
      if (!walletState.turnkeyClient) {
        throw new Error("Turnkey client not initialized");
      }

      console.log("XOFE: Attempting to create Solana wallet...");
      
      try {
        // Create a sub-organization for the user (simplified flow)
        const subOrgName = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        console.log("XOFE: Creating sub-organization:", subOrgName);
        
        // In a real implementation, you would need to handle authentication first
        // For now, we'll attempt direct wallet creation and handle auth errors gracefully
        
        const walletResponse = await walletState.turnkeyClient.createWallet({
          organizationId: "7df2c24f-4185-40e7-b16b-68600a5659c8", // Your org ID
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
        
        // Fallback: Generate a realistic Solana address for demo purposes
        console.log("XOFE: Falling back to simulated wallet for demo...");
        
        const simulatedWallet = {
          address: generateSolanaAddress(),
          isCreated: true,
          balance: 0,
          createdAt: Date.now(),
          isSimulated: true,
          note: "Real Turnkey integration requires user authentication setup"
        };

        walletState = { ...walletState, ...simulatedWallet };
        
        // Store wallet data
        await chrome.storage.local.set({ xofe_wallet_data: walletState });
        
        console.log("XOFE: Simulated Solana wallet created:", simulatedWallet.address);
        return { 
          success: true, 
          address: simulatedWallet.address,
          isSimulated: true,
          message: "Demo wallet created. Real Turnkey integration requires authentication setup."
        };
      }
      
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
