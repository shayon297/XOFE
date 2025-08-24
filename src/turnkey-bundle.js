// Bundle Turnkey SDK for Chrome extension use
import { TurnkeyBrowserClient, TurnkeyPasskeyClient, WebauthnStamper } from '@turnkey/sdk-browser';

// Export as webpack library (webpack will handle window assignment)
export {
  TurnkeyBrowserClient,
  TurnkeyPasskeyClient,
  WebauthnStamper
};
