// Bundle Turnkey SDK for Chrome extension use
import { Turnkey } from '@turnkey/sdk-browser';

// Export Turnkey to global window object for use in extension
window.TurnkeySDK = {
  Turnkey: Turnkey
};

console.log('Turnkey SDK bundled and ready for Chrome extension');
