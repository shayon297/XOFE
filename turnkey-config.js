// Turnkey Configuration
// Replace these with your actual Turnkey developer account details

export const TURNKEY_CONFIG = {
  // Your Turnkey organization ID from your developer dashboard
  defaultOrganizationId: "7df2c24f-4185-40e7-b16b-68600a5659c8",
  
  // Turnkey API base URL (usually this)
  apiBaseUrl: "https://api.turnkey.com",
  
  // Relying Party ID - typically your domain
  rpId: "localhost", // Change to your domain for production
  
  // Optional: Custom iframe URL if using embedded iframe
  iframeUrl: "https://auth.turnkey.com",
  
  // API Key details (for server-side operations if needed)
  apiKey: {
    id: "039faf5a-3e3b-40c3-9356-4c1421f5d483",
    name: "solanatwitter",
    publicKey: "031b93dcbcca4fc93f8f740a7e5de1848da907300c10c4ed9ccb6e472e51b58c89"
  },
  
  // Root user details
  rootUser: {
    id: "5c7356f3-736b-48ff-bd1f-67abed17a68e",
    email: "shayon@multicoin.capital",
    authenticatorId: "adcf7daa-2839-4f8a-808b-5781d1d4abc4"
  }
};

// Instructions:
// 1. Go to your Turnkey developer dashboard
// 2. Copy your Organization ID
// 3. Replace "YOUR_ORG_ID_HERE" with your actual org ID
// 4. Update rpId to match your domain (for production)

console.log("Turnkey config loaded. Make sure to update with your actual credentials!");
