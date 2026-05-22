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
      window.allJobs = [];
      jobListingsField.forEach(item => {
         const mapFields = item.mapValue?.fields || {};
         const title = mapFields.title?.stringValue;
         const id = mapFields.id?.integerValue || mapFields.id?.stringValue;
         const isActive = mapFields.isActiveJob?.booleanValue !== false;
         
         if (title && isActive) {
            hasActiveJobs = true;
            window.allJobs.push({ id: Number(id), title });
            
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
    if (!window.extractedBodyTextSummary) return;
    if (inputJob.options.length <= 1) return; // Not loaded yet
    
    const pageText = window.extractedBodyTextSummary.toLowerCase();
    
    // Check longest job titles first to avoid partial matches on single words
    const options = Array.from(inputJob.options).filter(opt => opt.value);
    options.sort((a,b) => b.value.length - a.value.length);
    
    for (let option of options) {
        const optionTitle = option.value.toLowerCase();
        
        if (pageText.includes(optionTitle)) {
            inputJob.value = option.value;
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
              } else if (!name && line.length < 50 && !line.includes('@') && !line.match(/Tahun|Bulan|Rp|Jt|Status|Pelamar|Tentang|Profil/i)) {
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
                 if (t && t.length < 40 && !t.match(/kandidat|lowongan|pintarnya|tentang|profil/i)) {
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
          
          let bodyTextSummary = document.title + ' \n ' + document.body.innerText.substring(0, 2000);
          
          return { name, phone, url, pageTitle, bodyTextSummary };
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
          
          // Save extracted page text for later matching with job listings
          window.extractedBodyTextSummary = response.bodyTextSummary || '';
          matchJobDropdown();
        }
      });
    });
  }

  btnExtract.addEventListener('click', extractFromPage);

  // Auto extract on open
  extractFromPage();

  btnSend.addEventListener('click', async () => {
    const name = inputName.value.trim();
    const phone = inputPhone.value.trim();
    const source = inputSource.value.trim();
    const jobTitle = inputJob.value.trim();
    let appUrl = inputAppUrl.value.trim();
    
    if (!appUrl.endsWith('/')) appUrl += '/';

    // Save preferences
    chrome.storage.local.set({ defaultAppUrl: appUrl, lastJobName: jobTitle });

    if (!name || !phone) {
      alert("Harap isi minimal Nama & No Telepon.");
      return;
    }
    
    if (!jobTitle) {
      alert("Harap pilih Nama Loker sebelum mengirim ke HR Workspace.");
      return;
    }
    
    const matchedJob = (window.allJobs || []).find(j => j.title === jobTitle);
    if (!matchedJob) {
      alert("Loker tidak valid. Cobalah untuk merefresh ekstensi.");
      return;
    }
    
    // Change button state
    const originalText = btnSend.textContent;
    btnSend.textContent = "Mengirim...";
    btnSend.disabled = true;
    
    try {
      const candidateId = Date.now();
      
      const commitUrl = "https://firestore.googleapis.com/v1/projects/gen-lang-client-0896426092/databases/ai-studio-fa9bbbd9-9a15-4474-9dc8-ee0009a60a80/documents:commit";
      const payload = {
        writes: [
          {
            transform: {
              document: "projects/gen-lang-client-0896426092/databases/ai-studio-fa9bbbd9-9a15-4474-9dc8-ee0009a60a80/documents/settings/recruitmentData",
              fieldTransforms: [
                {
                  fieldPath: "candidates",
                  appendMissingElements: {
                    values: [
                      {
                        mapValue: {
                          fields: {
                            id: { integerValue: candidateId },
                            jobId: { integerValue: matchedJob.id },
                            name: { stringValue: name },
                            phone: { stringValue: phone },
                            source: { stringValue: source },
                            stage: { stringValue: "Penjadwalan WA" }
                          }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      };
      
      const res = await fetch(commitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        throw new Error("Gagal mengirim ke database: " + res.statusText);
      }
      
      btnSend.textContent = "Berhasil! ✓";
      btnSend.style.backgroundColor = "#10b981"; // Emerald green
      
      setTimeout(() => {
        window.close(); // Close the popup automatically
      }, 1500);
      
    } catch(err) {
      console.error(err);
      alert("Terjadi kesalahan: " + err.message);
      btnSend.textContent = originalText;
      btnSend.disabled = false;
    }
  });
});
