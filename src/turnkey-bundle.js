// Bundle Turnkey SDK for Chrome extension use
import { TurnkeyBrowserClient, TurnkeyPasskeyClient, WebauthnStamper } from '@turnkey/sdk-browser';

// Export Turnkey to global window object for use in extension
window.TurnkeySDK = {
  TurnkeyBrowserClient: TurnkeyBrowserClient,
  TurnkeyPasskeyClient: TurnkeyPasskeyClient,
  WebauthnStamper: WebauthnStamper
};

console.log('Turnkey SDK with Solana support bundled and ready for Chrome extension');
