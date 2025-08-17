// inpage.js - Runs in page context to access window.solana
(() => {
  console.log("XOFE: Inpage script loaded");

  // Listen for messages from content script
  window.addEventListener("message", async (event) => {
    // Only accept messages from our extension
    if (event.source !== window) return;
    if (!event.data || !event.data.type || !event.data.source || event.data.source !== "xofe") return;

    console.log("XOFE: Inpage received message:", event.data);

    try {
      switch (event.data.type) {
        case "REQ_PUBKEY":
          await handleGetPublicKey(event);
          break;
        case "REQ_SIGN_SEND":
          await handleSignAndSend(event);
          break;
        default:
          console.log("XOFE: Unknown message type:", event.data.type);
      }
    } catch (error) {
      console.error("XOFE: Inpage error:", error);
      // Send error back to content script
      window.postMessage({
        source: "xofe",
        type: event.data.type === "REQ_PUBKEY" ? "PUBKEY_ERR" : "SIGN_ERR",
        error: error.message || "Unknown error"
      }, "*");
    }
  });

  async function handleGetPublicKey(event) {
    console.log("XOFE: Handling REQ_PUBKEY");
    
    // Check if Phantom is available
    if (!window.solana || !window.solana.isPhantom) {
      throw new Error("Phantom wallet not detected");
    }

    // Connect to Phantom if not already connected
    if (!window.solana.isConnected) {
      console.log("XOFE: Connecting to Phantom...");
      await window.solana.connect();
    }

    const publicKey = window.solana.publicKey;
    if (!publicKey) {
      throw new Error("Failed to get public key from Phantom");
    }

    console.log("XOFE: Got public key:", publicKey.toBase58());

    // Send success response
    window.postMessage({
      source: "xofe",
      type: "PUBKEY_OK",
      publicKey: publicKey.toBase58()
    }, "*");
  }

  async function handleSignAndSend(event) {
    console.log("XOFE: Handling REQ_SIGN_SEND");
    
    // Check if solanaWeb3 is loaded
    if (!window.solanaWeb3 || !window.solanaWeb3.VersionedTransaction) {
      throw new Error("Solana Web3.js not loaded properly");
    }
    
    console.log("XOFE: solanaWeb3 loaded, VersionedTransaction available:", !!window.solanaWeb3.VersionedTransaction);
    
    if (!window.solana || !window.solana.isPhantom) {
      throw new Error("Phantom wallet not detected");
    }

    if (!window.solana.isConnected) {
      throw new Error("Phantom wallet not connected");
    }

    const { base64 } = event.data;
    if (!base64) {
      throw new Error("No transaction data provided");
    }

    console.log("XOFE: Deserializing transaction...");
    
    // Deserialize the base64 transaction
    const transactionBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const versionedTransaction = solanaWeb3.VersionedTransaction.deserialize(transactionBuffer);
    
    console.log("XOFE: Transaction deserialized, signing and sending...");

    // Sign and send the transaction
    const { signature } = await window.solana.signAndSendTransaction(versionedTransaction);
    
    console.log("XOFE: Transaction sent successfully:", signature);

    // Create SolanaFM explorer link
    const explorer = `https://solana.fm/tx/${signature}?cluster=mainnet`;

    // Send success response
    window.postMessage({
      source: "xofe",
      type: "SIGN_OK",
      signature,
      explorer
    }, "*");
  }

  // Notify content script that inpage is ready
  window.postMessage({
    source: "mintpop",
    type: "INPAGE_READY"
  }, "*");

})();
