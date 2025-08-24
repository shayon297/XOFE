// Bundle Turnkey SDK for Chrome extension use
import { Turnkey } from '@turnkey/sdk-browser';
import { TurnkeySigner } from '@turnkey/solana';

// Export Turnkey to global window object for use in extension
window.TurnkeySDK = {
  Turnkey: Turnkey,
  TurnkeySigner: TurnkeySigner
};

console.log('Turnkey SDK with Solana support bundled and ready for Chrome extension');
