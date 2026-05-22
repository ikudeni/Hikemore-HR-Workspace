document.addEventListener('DOMContentLoaded', () => {
  const btnExtract = document.getElementById('extractBtn');
  const btnSend = document.getElementById('sendBtn');
  
  const inputName = document.getElementById('candName');
  const inputPhone = document.getElementById('candPhone');
  const inputSource = document.getElementById('candSource');
  const inputJob = document.getElementById('candJob');
  const inputAppUrl = document.getElementById('appUrl');

  // Load saved configurations
  chrome.storage.local.get(['defaultAppUrl', 'lastJobName'], (res) => {
    if (res.defaultAppUrl && !res.defaultAppUrl.includes('ais-dev')) {
      inputAppUrl.value = res.defaultAppUrl;
    } else {
      // Fallback default (Force updated to production domain)
      inputAppUrl.value = 'https://hrdhikemore.vercel.app/';
    }
    
    if (res.lastJobName) {
      inputJob.value = res.lastJobName;
    }
  });

  function extractFromPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      const tab = tabs[0];
      
      // Try to determine source by URL
      if (tab.url.includes('glints')) inputSource.value = 'Glints';
      else if (tab.url.includes('pintarnya')) inputSource.value = 'Pintarnya';
      else if (tab.url.includes('indeed')) inputSource.value = 'Indeed';
      else if (tab.url.includes('seek') || tab.url.includes('jobstreet')) inputSource.value = 'Jobstreet';
      else if (tab.url.includes('google.com/spreadsheets')) inputSource.value = 'Spreadsheet';
      else inputSource.value = 'Lainnya';

      chrome.tabs.sendMessage(tab.id, { action: "extract" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Error:", chrome.runtime.lastError.message);
          return;
        }
        
        if (response) {
          if (response.name) inputName.value = response.name;
          if (response.phone) {
             let cleanPhone = response.phone.replace(/[^0-9+]/g, '');
             if (cleanPhone.startsWith('62')) cleanPhone = '0' + cleanPhone.slice(2);
             if (cleanPhone.startsWith('+62')) cleanPhone = '0' + cleanPhone.slice(3);
             inputPhone.value = cleanPhone;
          }
        }
      });
    });
  }

  btnExtract.addEventListener('click', extractFromPage);

  // Auto extract on open
  extractFromPage();

  btnSend.addEventListener('click', () => {
    const name = inputName.value.trim();
    const phone = inputPhone.value.trim();
    const source = inputSource.value.trim();
    const job = inputJob.value.trim();
    let appUrl = inputAppUrl.value.trim();
    
    if (!appUrl.endsWith('/')) appUrl += '/';

    // Save preferences
    chrome.storage.local.set({ defaultAppUrl: appUrl, lastJobName: job });

    if (!name || !phone) {
      alert("Harap isi minimal Nama & No Telepon.");
      return;
    }

    const targetUrl = new URL(appUrl);
    targetUrl.searchParams.set('action', 'add_candidate');
    targetUrl.searchParams.set('name', name);
    targetUrl.searchParams.set('phone', phone);
    targetUrl.searchParams.set('source', source);
    targetUrl.searchParams.set('job', job);

    chrome.tabs.create({ url: targetUrl.toString() });
  });
});
