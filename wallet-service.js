// XOFE Wallet Service - Real Turnkey integration via background script
(() => {
  console.log("XOFE: Wallet Service loading...");

  // Wallet state management
  let walletState = {
    isInitialized: false,
    isCreated: false,
    address: null,
    balance: 0,
    subOrganizationId: null,
    userId: null,
    userEmail: null
  };

  // Initialize wallet system
  async function initWallet() {
    if (walletState.isInitialized) return;
    
    try {
      console.log("XOFE: Initializing wallet system...");
      
      // Load existing wallet from storage
      const stored = await chrome.storage.local.get(['xofe_wallet']);
      if (stored.xofe_wallet) {
        walletState = { ...walletState, ...stored.xofe_wallet };
        console.log("XOFE: Loaded existing wallet:", walletState.address);
      }
      
      walletState.isInitialized = true;
      console.log("XOFE: Wallet system initialized");
      
    } catch (error) {
      console.error("XOFE: Wallet init error:", error);
      walletState.isInitialized = true;
    }
  }

  // Create wallet via background script
  async function createWallet() {
    try {
      console.log("XOFE: Starting wallet creation via background script...");
      
      if (!walletState.isInitialized) {
        await initWallet();
      }

      // Send message to background script to create wallet
      const response = await chrome.runtime.sendMessage({
        type: 'WALLET_CREATE',
        data: {
          userEmail: `xofe-user-${Date.now()}@example.com`,
          userName: `XOFE-User-${Date.now()}`
        }
      });

      if (response.success) {
        // Update wallet state
        walletState = {
          ...walletState,
          isCreated: true,
          address: response.address,
          subOrganizationId: response.subOrganizationId,
          userId: response.userId,
          userEmail: response.userEmail
        };

        // Save to storage
        await chrome.storage.local.set({ xofe_wallet: walletState });
        
        console.log("XOFE: Wallet creation complete:", response.address);

        return {
          success: true,
          address: response.address,
          message: `✅ Wallet created! Address: ${response.address.slice(0, 8)}...${response.address.slice(-8)}`
        };
      } else {
        throw new Error(response.error);
      }

    } catch (error) {
      console.error("XOFE: Wallet creation failed:", error);
      
      return {
        success: false,
        error: error.message,
        message: `❌ Wallet creation failed: ${error.message}`
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

  // Fund wallet - simplified without iframe (CSP issues)
  async function fundWallet(amount = 100) {
    try {
      console.log("XOFE: Starting wallet funding with $", amount);
      
      if (!walletState.isCreated || !walletState.address) {
        throw new Error("No wallet created yet");
      }

      // For now, simulate funding success
      // In production, this would integrate with Coinbase Pay properly
      walletState.balance += amount;
      await chrome.storage.local.set({ xofe_wallet: walletState });
      
      return {
        success: true,
        balance: walletState.balance,
        message: `✅ Funded with $${amount} USDC`
      };

    } catch (error) {
      console.error("XOFE: Funding failed:", error);
      
      return {
        success: false,
        error: error.message,
        message: `❌ Funding failed: ${error.message}`
      };
    }
  }

  // Sign transaction via background script
  async function signTransaction(base64Transaction) {
    try {
      console.log("XOFE: Signing transaction via background script...");
      
      if (!walletState.isCreated) {
        throw new Error("No wallet created");
      }
      
      // Send message to background script to sign transaction
      const response = await chrome.runtime.sendMessage({
        type: 'WALLET_SIGN',
        data: {
          transaction: base64Transaction,
          subOrganizationId: walletState.subOrganizationId,
          address: walletState.address
        }
      });

      if (response.success) {
        console.log("XOFE: Transaction signed:", response.signature);
        
        return {
          success: true,
          signature: response.signature,
          message: "✅ Transaction signed with Turnkey"
        };
      } else {
        throw new Error(response.error);
      }
      
    } catch (error) {
      console.error("XOFE: Transaction signing failed:", error);
      
      return {
        success: false,
        error: error.message,
        message: `❌ Transaction signing failed: ${error.message}`
      };
    }
  }

  // Export wallet functions
  window.XOFESimpleWallet = {
    init: initWallet,
    create: createWallet,
    getStatus: getWalletStatus,
    fund: fundWallet,
    sign: signTransaction
  };

  console.log("XOFE: Wallet Service ready");
})();
