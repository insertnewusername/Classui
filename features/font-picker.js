// ==========================================
// FONT PICKER – Custom Fonts for Classroom
// ==========================================

const FONT_STORAGE_KEY = 'classyui_selected_font';
const DEFAULT_FONT = 'Google Sans';
const FONT_CSS_ID = 'classyui-font-style';

// Available fonts (you can add more)
const AVAILABLE_FONTS = [
  { name: 'Google Sans', value: 'Google Sans', url: '' },
  { name: 'Inter', value: 'Inter', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap' },
  { name: 'Roboto', value: 'Roboto', url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap' },
  { name: 'Open Sans', value: 'Open Sans', url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700&display=swap' },
  { name: 'Lato', value: 'Lato', url: 'https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap' },
  { name: 'Poppins', value: 'Poppins', url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap' },
  { name: 'Montserrat', value: 'Montserrat', url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap' },
  { name: 'Merriweather', value: 'Merriweather', url: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700;900&display=swap' },
  { name: 'Comic Neue', value: 'Comic Neue', url: 'https://fonts.googleapis.com/css2?family=Comic+Neue:wght@300;400;700&display=swap' },
  { name: 'Nunito', value: 'Nunito', url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;600;700;800&display=swap' },
  { name: 'Quicksand', value: 'Quicksand', url: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&display=swap' },
  { name: 'Work Sans', value: 'Work Sans', url: 'https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700;800&display=swap' },
  { name: 'Rubik', value: 'Rubik', url: 'https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800;900&display=swap' },
  { name: 'Space Grotesk', value: 'Space Grotesk', url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap' },
  { name: 'Plus Jakarta Sans', value: 'Plus Jakarta Sans', url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap' },
  { name: 'DM Sans', value: 'DM Sans', url: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap' },
  { name: 'Outfit', value: 'Outfit', url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap' },
  { name: 'Figtree', value: 'Figtree', url: 'https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800;900&display=swap' },
  { name: 'Passion One', value: 'Passion One', url: 'https://fonts.googleapis.com/css2?family=Passion+One:wght@400;700;900&display=swap' },
  { name: 'Bangers', value: 'Bangers', url: 'https://fonts.googleapis.com/css2?family=Bangers&display=swap' },
  { name: 'Luckiest Guy', value: 'Luckiest Guy', url: 'https://fonts.googleapis.com/css2?family=Luckiest+Guy&display=swap' },
  { name: 'Comic Sans', value: 'Comic Sans MS, Comic Sans, cursive', url: '' },
  { name: 'Public Sans', value: 'Public Sans', url: 'https://fonts.googleapis.com/css2?family=Public+Sans:wght@100;200;300;400;500;600;700;800;900&display=swap' },
  { name: 'Lobster', value: 'Lobster', url: 'https://fonts.googleapis.com/css2?family=Lobster&display=swap' },
  


  // System fonts (no URL)
  { name: 'Arial', value: 'Arial, Helvetica, sans-serif', url: '' },
  { name: 'Helvetica', value: 'Helvetica, Arial, sans-serif', url: '' },
  { name: 'Georgia', value: 'Georgia, serif', url: '' },
  { name: 'Times New Roman', value: 'Times New Roman, serif', url: '' },
  { name: 'Courier New', value: 'Courier New, monospace', url: '' },
  { name: 'System Default', value: 'system-ui, -apple-system, sans-serif', url: '' },

];

function preloadAllFonts() {
  AVAILABLE_FONTS.forEach(font => {
    if (font.url) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = font.url;
      // optional: add media="print" for better performance
      link.media = 'print';
      link.onload = () => { link.media = 'all'; };
      document.head.appendChild(link);
    }
  });
}

// ---- Load saved font ----
function loadSelectedFont() {
  try {
    const saved = localStorage.getItem(FONT_STORAGE_KEY);
    if (saved) return saved;
  } catch (_) {}
  return DEFAULT_FONT;
}

// ---- Save font ----
function saveSelectedFont(fontName) {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, fontName);
  } catch (_) {}
}

// ---- Apply font to the page ----
function applyFont(fontName) {
  // Remove any existing font style tags we injected
  const oldStyle = document.getElementById(FONT_CSS_ID);
  if (oldStyle) oldStyle.remove();

  // Find the font object
  const font = AVAILABLE_FONTS.find(f => f.name === fontName) || AVAILABLE_FONTS[0];

  // If it has a Google Font URL, load it
  if (font.url) {
    const link = document.createElement('link');
    link.id = FONT_CSS_ID;
    link.rel = 'stylesheet';
    link.href = font.url;
    document.head.appendChild(link);
  }

  // Apply the font to the body
  document.body.style.fontFamily = font.value;
  document.body.style.setProperty('--cui-font-family', font.value);

  // Also apply to all elements with a high-specificity rule
  const style = document.createElement('style');
  style.id = FONT_CSS_ID + '-apply';
  // Remove old apply style if exists
  const oldApply = document.getElementById(FONT_CSS_ID + '-apply');
  if (oldApply) oldApply.remove();

  style.textContent = `
    body, body *:not(.material-icons):not(.google-symbols):not(.quRWN-Bz112c):not(i) {
      font-family: ${font.value} !important;
    }
  `;
  document.head.appendChild(style);
}

// ---- Initialize font on load ----
function initFontPicker() {
  const savedFont = loadSelectedFont();
  applyFont(savedFont);
  preloadAllFonts();
}

// ---- Expose functions globally for settings panel ----
if (typeof window !== 'undefined') {
  window.fontPicker = {
    loadSelectedFont,
    saveSelectedFont,
    applyFont,
    initFontPicker,
    getAvailableFonts: () => AVAILABLE_FONTS,
    preloadAllFonts, // add this
  };
}

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFontPicker);
} else {
  initFontPicker();
}