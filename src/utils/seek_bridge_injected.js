/**
 * This script runs in the MAIN world (page context) to access YouTube's video element.
 * It's injected as an external script to comply with CSP.
 */
(function() {
  const SEEK_MSG_TYPE = 'YT_QA_SEEK';
  
  window.addEventListener('message', function(e) {
    if (e.source !== window || !e.data || e.data.type !== SEEK_MSG_TYPE) return;
    const video = document.querySelector('video');
    if (video) video.currentTime = e.data.sec;
  });
})();
