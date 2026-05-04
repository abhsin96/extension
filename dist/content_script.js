// src/content_script.js
var SENTINEL = "[YouTube Q&A] content script active";
function getVideoId() {
  return new URLSearchParams(location.search).get("v");
}
function notifyVideoChanged(videoId) {
  chrome.runtime.sendMessage({ type: "VIDEO_CHANGED", videoId });
}
var initial = getVideoId();
if (initial) {
  console.log(SENTINEL, { videoId: initial });
  notifyVideoChanged(initial);
}
var lastVideoId = initial;
new MutationObserver(() => {
  const current = getVideoId();
  if (current && current !== lastVideoId) {
    lastVideoId = current;
    console.log(SENTINEL, { videoId: current });
    notifyVideoChanged(current);
  }
}).observe(document.body, { childList: true, subtree: true });
