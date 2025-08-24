// Bundle Turnkey SDK for Chrome extension use
import { TurnkeyBrowserClient, TurnkeyPasskeyClient, WebauthnStamper } from '@turnkey/sdk-browser';

// Directly assign to window (fuck webpack's library system)
window.TurnkeySDK = {
  TurnkeyBrowserClient,
  TurnkeyPasskeyClient, 
  WebauthnStamper
};

console.log('XOFE: TurnkeySDK assigned to window:', window.TurnkeySDK);
