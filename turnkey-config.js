// Turnkey Configuration
// Replace these with your actual Turnkey developer account details

export const TURNKEY_CONFIG = {
  // Your Turnkey organization ID from your developer dashboard
  defaultOrganizationId: "YOUR_ORG_ID_HERE",
  
  // Turnkey API base URL (usually this)
  apiBaseUrl: "https://api.turnkey.com",
  
  // Relying Party ID - typically your domain
  rpId: "localhost", // Change to your domain for production
  
  // Optional: Custom iframe URL if using embedded iframe
  iframeUrl: "https://auth.turnkey.com",
};

// Instructions:
// 1. Go to your Turnkey developer dashboard
// 2. Copy your Organization ID
// 3. Replace "YOUR_ORG_ID_HERE" with your actual org ID
// 4. Update rpId to match your domain (for production)

console.log("Turnkey config loaded. Make sure to update with your actual credentials!");
