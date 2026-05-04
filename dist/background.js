// src/background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("YouTube Q&A: background service worker started");
});
