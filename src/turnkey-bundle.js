// Bundle Turnkey SDK for Chrome extension use
import { TurnkeyBrowserClient, TurnkeyPasskeyClient, WebauthnStamper } from '@turnkey/sdk-browser';

console.log('XOFE Bundle: Starting to set up Turnkey SDK...');
console.log('XOFE Bundle: TurnkeyBrowserClient imported:', !!TurnkeyBrowserClient);
console.log('XOFE Bundle: TurnkeyPasskeyClient imported:', !!TurnkeyPasskeyClient);
console.log('XOFE Bundle: WebauthnStamper imported:', !!WebauthnStamper);

// Export Turnkey to global window object for use in extension
window.TurnkeySDK = {
  TurnkeyBrowserClient: TurnkeyBrowserClient,
  TurnkeyPasskeyClient: TurnkeyPasskeyClient,
  WebauthnStamper: WebauthnStamper
};

console.log('XOFE Bundle: window.TurnkeySDK set to:', window.TurnkeySDK);
console.log('Turnkey SDK with Solana support bundled and ready for Chrome extension');
