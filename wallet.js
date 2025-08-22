// wallet.js - Embedded wallet functionality
(() => {
  console.log("XOFE: Wallet module loaded");

  let walletState = {
    isCreated: false,
    address: null,
    balance: 0,
    isInitialized: false
  };

  // Initialize wallet module
  async function initWallet() {
    if (walletState.isInitialized) return;
    
    try {
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

  // Create wallet using Turnkey (placeholder implementation)
  async function createWallet() {
    try {
      console.log("XOFE: Creating new wallet with Turnkey...");
      
      // TODO: Implement actual Turnkey wallet creation
      // For now, create a placeholder wallet
      const mockWallet = {
        address: "PLACEHOLDER_" + Math.random().toString(36).substr(2, 9),
        isCreated: true,
        balance: 0,
        createdAt: Date.now()
      };

      walletState = { ...walletState, ...mockWallet };
      
      // Store wallet data
      await chrome.storage.local.set({ xofe_wallet_data: walletState });
      
      console.log("XOFE: Wallet created successfully:", walletState.address);
      return { success: true, address: walletState.address };
      
    } catch (error) {
      console.error("XOFE: Error creating wallet:", error);
      return { success: false, error: error.message };
    }
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
