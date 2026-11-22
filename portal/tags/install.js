if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/tags/sw.js').catch(console.error);
}
