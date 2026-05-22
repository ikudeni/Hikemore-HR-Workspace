// content.js
// This script tries to extract Name and Phone Number from the active page.

function extractData() {
  const url = window.location.href;
  
  let name = '';
  let phone = '';
  
  // Try to use selected text first
  const selection = window.getSelection().toString().trim();
  if (selection) {
    // Basic heuristics on selected text
    const lines = selection.split('\n').map(l => l.trim()).filter(Boolean);
    
    lines.forEach(line => {
      // Find Indonesian phone numbers
      const phoneMatch = line.match(/(?:\+62|62|0)8[1-9][0-9]{6,10}/);
      if (phoneMatch) {
         phone = phoneMatch[0];
      } else if (!name && line.length < 50 && !line.includes('@') && !line.match(/Tahun|Bulan|Rp|Jt/i)) {
         name = line; // Assume first short line that isn't a phone is the name
      }
    });

    return { name, phone, url };
  }
  
  // Platform-specific heuristics (best effort fallback)
  if (url.includes('glints.id')) {
    // Attempt Glints parsing
    const nameEl = document.querySelector('h3, .name, [class*="CandidateName"]');
    if (nameEl) name = nameEl.textContent.trim();
  } else if (url.includes('pintarnya.com')) {
    const nameEl = document.querySelector('h1, h2, [class*="ProfileName"]');
    if (nameEl) name = nameEl.textContent.trim();
  } else if (url.includes('indeed.com')) {
    const nameEl = document.querySelector('h1, h2, [class*="Name"]');
    if (nameEl) name = nameEl.textContent.trim();
  } else if (url.includes('seek.com') || url.includes('jobstreet')) {
    const nameEl = document.querySelector('h1, h2');
    if (nameEl) name = nameEl.textContent.trim();
  } else if (url.includes('docs.google.com/spreadsheets')) {
    // Inside Google sheets, getting data without API is hard unless it's selected.
    // So the selection heuristic above is best for Sheets.
  }
  
  // Common Phone extraction from entire body if not found
  if (!phone) {
    const bodyText = document.body.innerText;
    const phoneMatch = bodyText.match(/(?:\+62|62|0)8[1-9][0-9]{6,10}/);
    if (phoneMatch) {
      phone = phoneMatch[0];
    }
  }

  return { name, phone, url };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    sendResponse(extractData());
  }
});
