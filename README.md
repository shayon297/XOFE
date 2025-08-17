# xofe

chrome extension for trading solana tokens on x/twitter. detects contract addresses and shows price charts with direct phantom wallet integration.

built with manifest v3 architecture using content scripts for address detection, service worker for api calls, and inpage scripts for wallet communication. uses jupiter apis for pricing and swaps, geckoterminal for 24h chart data, solana web3.js for transaction handling.

download zip, extract, load unpacked in chrome developer mode. works immediately with phantom wallet installed.