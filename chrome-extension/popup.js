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
  });

  // Fetch job listings from Firebase
  async function fetchJobs() {
    try {
      const url = "https://firestore.googleapis.com/v1/projects/gen-lang-client-0896426092/databases/ai-studio-fa9bbbd9-9a15-4474-9dc8-ee0009a60a80/documents/settings/recruitmentData";
      const res = await fetch(url);
      const data = await res.json();
      
      const jobListingsField = data.fields?.jobListings?.arrayValue?.values || [];
      inputJob.innerHTML = '<option value="">-- Pilih Posisi / Loker --</option>'; // Clear existing
      
      let hasActiveJobs = false;
      jobListingsField.forEach(item => {
         const mapFields = item.mapValue?.fields || {};
         const title = mapFields.title?.stringValue;
         const isActive = mapFields.isActiveJob?.booleanValue !== false; // If undefined, assume true like active
         
         if (title && isActive) {
            hasActiveJobs = true;
            const option = document.createElement('option');
            option.value = title;
            option.textContent = title;
            inputJob.appendChild(option);
         }
      });
      
      if (!hasActiveJobs) {
        inputJob.innerHTML = '<option value="">-- Belum ada Loker Aktif di Web HR --</option>';
      } else {
        // Attempt to auto-match job if extraction finished first
        matchJobDropdown();
        
        // Restore last selected job if no auto-match was found
        chrome.storage.local.get(['lastJobName'], (res) => {
          if (res.lastJobName && !window.matchedAJob) {
            inputJob.value = res.lastJobName;
          }
        });
      }
    } catch(e) {
      console.error(e);
      inputJob.innerHTML = '<option value="">Gagal sinkronisasi data loker</option>';
    }
  }

  function matchJobDropdown() {
    if (!window.extractedPageTitle) return;
    if (inputJob.options.length <= 1) return; // Not loaded yet
    
    const pageTitle = window.extractedPageTitle.toLowerCase();
    
    for (let i = 0; i < inputJob.options.length; i++) {
        const optionTitle = inputJob.options[i].value;
        if (!optionTitle) continue;
        
        // Simple fuzzy match: does the option text exist in the page title?
        // E.g., option: "Admin Online Shop", pageTitle: "admin online shop (surabaya) - pintarnya"
        if (pageTitle.includes(optionTitle.toLowerCase())) {
            inputJob.value = optionTitle;
            window.matchedAJob = true;
            return;
        }
    }
  }

  fetchJobs();

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

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const url = window.location.href;
          const pageTitle = document.title;
          let name = '';
          let phone = '';
          
          const selection = window.getSelection().toString().trim();
          if (selection) {
            const lines = selection.split('\n').map(l => l.trim()).filter(Boolean);
            lines.forEach(line => {
              const phoneMatch = line.match(/(?:\+62|62|0)8[1-9][0-9]{6,12}/);
              if (phoneMatch) {
                 phone = phoneMatch[0];
              } else if (!name && line.length < 50 && !line.includes('@') && !line.match(/Tahun|Bulan|Rp|Jt|Status|Pelamar/i)) {
                 name = line;
              }
            });
          }
          
          // Platform-specific heuristics
          if (!name) {
            if (url.includes('glints.id')) {
              const nameEl = document.querySelector('h3, .name, [class*="CandidateName"]');
              if (nameEl) name = nameEl.textContent.trim();
            } else if (url.includes('pintarnya.com')) {
              // Try grabbing name from heading tags that don't contains common words
               const headings = Array.from(document.querySelectorAll('h1, h2, h3, [class*="name" i], [class*="profile" i]'));
               for (let h of headings) {
                 let t = h.textContent.trim();
                 if (t && t.length < 40 && !t.match(/kandidat|lowongan|pintarnya/i)) {
                   name = t;
                   break;
                 }
               }
            } else if (url.includes('indeed.com')) {
              const nameEl = document.querySelector('h1, h2, [class*="Name"]');
              if (nameEl) name = nameEl.textContent.trim();
            } else if (url.includes('seek.com') || url.includes('jobstreet')) {
              const nameEl = document.querySelector('h1, h2');
              if (nameEl) name = nameEl.textContent.trim();
            }
          }
          
          if (!phone) {
            const bodyText = document.body.innerText;
            const phoneMatch = bodyText.match(/(?:\+62|62|0)8[1-9][0-9]{6,12}/);
            if (phoneMatch) {
              phone = phoneMatch[0];
            }
          }
          
          return { name, phone, url, pageTitle };
        }
      }, (injectionResults) => {
        if (chrome.runtime.lastError) {
          console.log("Error:", chrome.runtime.lastError.message);
          return;
        }
        
        if (injectionResults && injectionResults[0] && injectionResults[0].result) {
          const response = injectionResults[0].result;
          if (response.name) inputName.value = response.name;
          if (response.phone) {
             let cleanPhone = response.phone.replace(/[^0-9+]/g, '');
             if (cleanPhone.startsWith('62')) cleanPhone = '0' + cleanPhone.slice(2);
             if (cleanPhone.startsWith('+62')) cleanPhone = '0' + cleanPhone.slice(3);
             inputPhone.value = cleanPhone;
          }
          
          // Save extracted page title for later matching with job listings
          window.extractedPageTitle = response.pageTitle || '';
          matchJobDropdown();
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
