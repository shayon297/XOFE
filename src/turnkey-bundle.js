// Bundle Turnkey SDK for Chrome extension use
import { TurnkeyBrowserClient, TurnkeyPasskeyClient, WebauthnStamper } from '@turnkey/sdk-browser';

// Multiple assignment strategies to ensure it works
const TurnkeySDK = {
  TurnkeyBrowserClient,
  TurnkeyPasskeyClient, 
  WebauthnStamper
};

// Assign to all possible global contexts
globalThis.TurnkeySDK = TurnkeySDK;

// For browser context
if (typeof window !== 'undefined') {
  window.TurnkeySDK = TurnkeySDK;
  
  // Also dispatch custom event for cross-context communication
  window.dispatchEvent(new CustomEvent('turnkey-sdk-loaded', { 
    detail: TurnkeySDK 
  }));
}

// For Service Worker context
if (typeof self !== 'undefined') {
  self.TurnkeySDK = TurnkeySDK;
}

// For Node.js context
if (typeof global !== 'undefined') {
  global.TurnkeySDK = TurnkeySDK;
}

console.log('XOFE: TurnkeySDK assigned to globalThis:', globalThis.TurnkeySDK);
console.log('XOFE: TurnkeySDK assigned to self:', typeof self !== 'undefined' ? self.TurnkeySDK : 'self undefined');
console.log('XOFE: TurnkeySDK assigned to window:', typeof window !== 'undefined' ? window.TurnkeySDK : 'window undefined');
console.log('XOFE: TurnkeyBrowserClient available:', !!TurnkeyBrowserClient);
