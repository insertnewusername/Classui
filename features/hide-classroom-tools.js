// content.js
function hideBlock() {
  // Find the container using stable data attributes
  const container = document.querySelector('div[data-role="container"][data-view-type="3"]');
  if (!container) return;

  // Traverse up two levels: container -> div.QN7cze -> outer block (dxDXsf)
  const outerBlock = container.parentElement?.parentElement;
  if (!outerBlock) return;

  // Option 1: Hide (keep in DOM but invisible)
  outerBlock.style.display = 'none';

  // Option 2: Delete (remove from DOM completely)
  // outerBlock.remove();
}

// Run on initial load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hideBlock);
} else {
  hideBlock();
}

// Watch for dynamically added content (e.g., when switching views)
const observer = new MutationObserver(() => {
  // Check if the block appears again (e.g., after navigation)
  hideBlock();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});