// Bundle Turnkey SDK for Chrome extension use
import { TurnkeyBrowserClient, TurnkeyPasskeyClient, WebauthnStamper } from '@turnkey/sdk-browser';

// Multiple assignment strategies to ensure it works
const TurnkeySDK = {
  TurnkeyBrowserClient,
  TurnkeyPasskeyClient, 
  WebauthnStamper
};

// Try multiple assignment methods
window.TurnkeySDK = TurnkeySDK;
globalThis.TurnkeySDK = TurnkeySDK;

// Also assign to a custom event for cross-context communication
window.dispatchEvent(new CustomEvent('turnkey-sdk-loaded', { 
  detail: TurnkeySDK 
}));

// Store in a global variable that webpack can access
if (typeof global !== 'undefined') {
  global.TurnkeySDK = TurnkeySDK;
}

console.log('XOFE: TurnkeySDK assigned to window:', window.TurnkeySDK);
console.log('XOFE: TurnkeySDK assigned to globalThis:', globalThis.TurnkeySDK);
console.log('XOFE: TurnkeyBrowserClient available:', !!TurnkeyBrowserClient);
