import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface GajihubConfig {
  endpoint: string;
  token: string;
  employeeMappings: Record<string, string>; // maps localEmployeeId -> gajihubEmployeeId (from Kledo contacts/employees)
  syncedLogs: Record<string, { syncedAt: string; response: string; payload: string }>; // maps localLogId -> sync details
  autoSyncEnabled: boolean;
  autoSyncIntervalSeconds: number;
}

const DEFAULT_CONFIG: GajihubConfig = {
  endpoint: 'https://pthobimenjadirintisan.api.kledo.com/api/v1',
  token: 'gajihub_pat_000Zxu_AAPsQJunKBZm9K-yCwL4IC8lE2Qdp6SeoBhQosStmLTTTX-dWcjgP09-_MeMwEnMCo5lLcekMuLgH85W',
  employeeMappings: {
    'emp_ahda_qinthara': '101',
    'emp_ahmad_hasmil': '102',
    'emp_ahmad_izzuddin_al_hakim': '103',
    'emp_ajay_saputra': '104',
    'emp_anggadewi_putri_rayani': '105',
    'emp_asep_taopik_hidayat': '106',
    'emp_aura_prisca': '107',
    'emp_catarina_cindy_flayerti': '108',
    'emp_deni_akbar_saputro': '109',
    'emp_desi_susanti': '110',
    'emp_diky_antonius': '111'
  },
  syncedLogs: {},
  autoSyncEnabled: true,
  autoSyncIntervalSeconds: 30
};

// Local cache for faster loading
let cachedConfig: GajihubConfig | null = null;

/**
 * Loads the Gajihub configuration from Firestore (or localStorage fallback).
 */
export async function getGajihubConfig(): Promise<GajihubConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const docRef = doc(db, 'gajihubSettings', 'config');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as Partial<GajihubConfig>;
      cachedConfig = {
        endpoint: data.endpoint || DEFAULT_CONFIG.endpoint,
        token: data.token || DEFAULT_CONFIG.token,
        employeeMappings: data.employeeMappings || {},
        syncedLogs: data.syncedLogs || {},
        autoSyncEnabled: data.autoSyncEnabled !== undefined ? data.autoSyncEnabled : DEFAULT_CONFIG.autoSyncEnabled,
        autoSyncIntervalSeconds: data.autoSyncIntervalSeconds !== undefined ? data.autoSyncIntervalSeconds : DEFAULT_CONFIG.autoSyncIntervalSeconds
      };
      return cachedConfig;
    }
  } catch (error) {
    console.warn('Firestore load failed for Gajihub settings, falling back to localStorage:', error);
  }

  // Local storage fallback
  try {
    const local = localStorage.getItem('gajihub_config');
    if (local) {
      const data = JSON.parse(local);
      cachedConfig = {
        endpoint: data.endpoint || DEFAULT_CONFIG.endpoint,
        token: data.token || DEFAULT_CONFIG.token,
        employeeMappings: data.employeeMappings || {},
        syncedLogs: data.syncedLogs || {},
        autoSyncEnabled: data.autoSyncEnabled !== undefined ? data.autoSyncEnabled : DEFAULT_CONFIG.autoSyncEnabled,
        autoSyncIntervalSeconds: data.autoSyncIntervalSeconds !== undefined ? data.autoSyncIntervalSeconds : DEFAULT_CONFIG.autoSyncIntervalSeconds
      };
      return cachedConfig;
    }
  } catch (e) {}

  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

/**
 * Saves the Gajihub configuration to both Firestore and localStorage.
 */
export async function saveGajihubConfig(config: GajihubConfig): Promise<void> {
  cachedConfig = config;

  // Save to localStorage immediately
  try {
    localStorage.setItem('gajihub_config', JSON.stringify(config));
  } catch (e) {}

  // Save to Firestore
  try {
    const docRef = doc(db, 'gajihubSettings', 'config');
    await setDoc(docRef, config);
  } catch (error) {
    console.error('Failed to save Gajihub settings to Firestore:', error);
  }
}

export interface GajihubEmployee {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  code?: string;
  type?: string;
}

/**
 * Internal helper to fetch with multi-stage fallback:
 * Stage 1: Try local Express proxy (/api/gajihub-proxy?url=...)
 * Stage 2: Try public client-side CORS proxy (corsproxy.io/?url=...)
 * Stage 3: Try direct fetch (useful if user has CORS extension or on native origins)
 */
async function fetchWithFallback(
  targetUrl: string,
  method: string,
  token: string,
  body?: any
): Promise<{ ok: boolean; status: number; text: string; error?: string; isCorsError?: boolean }> {
  const proxyUrl = `/api/gajihub-proxy?url=${encodeURIComponent(targetUrl)}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  // Stage 1: Local Express Proxy
  try {
    console.log(`[Gajihub API] Trying Stage 1 (Local Express Proxy): ${proxyUrl}`);
    const res = await fetch(proxyUrl, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    
    const text = await res.text();
    
    // Check if CDN intercepted request and returned our app's index.html
    const isHtml = text.trim().startsWith('<!doctype html') || text.trim().startsWith('<html') || text.includes('<title>Hikemore HR');
    
    if (!isHtml) {
      let errorMsg = undefined;
      if (!res.ok) {
        errorMsg = `API returned status ${res.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.message) {
            errorMsg = `${parsed.message} (Status ${res.status})`;
          } else if (parsed && parsed.error) {
            errorMsg = `${parsed.error} (Status ${res.status})`;
          }
        } catch (e) {}
      }
      return { ok: res.ok, status: res.status, text, error: errorMsg };
    }
    
    console.warn('[Gajihub API] Stage 1 returned HTML. App might be deployed as a static SPA. Trying Stage 2...');
  } catch (err: any) {
    console.error('[Gajihub API] Stage 1 request failed:', err);
  }

  // Stage 2: Public Client-Side CORS Proxy (corsproxy.io)
  const publicProxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
  try {
    console.log(`[Gajihub API] Trying Stage 2 (Public CORS Proxy): ${publicProxyUrl}`);
    const res = await fetch(publicProxyUrl, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    
    const text = await res.text();
    const isHtml = text.trim().startsWith('<!doctype html') || text.trim().startsWith('<html');
    const isProxyError = text.includes('Server-side requests are not allowed') || text.includes('corsproxy.io/pricing');

    if (!isHtml && !isProxyError) {
      let errorMsg = undefined;
      if (!res.ok) {
        errorMsg = `CORS Proxy returned status ${res.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.message) {
            errorMsg = `${parsed.message} (Status ${res.status})`;
          } else if (parsed && parsed.error) {
            errorMsg = `${parsed.error} (Status ${res.status})`;
          }
        } catch (e) {}
      }
      return { ok: res.ok, status: res.status, text, error: errorMsg };
    }
  } catch (err: any) {
    console.error('[Gajihub API] Stage 2 request failed:', err);
  }

  // Stage 3: Direct Fetch Connection (as final fallback)
  try {
    console.log(`[Gajihub API] Trying Stage 3 (Direct Connection): ${targetUrl}`);
    const res = await fetch(targetUrl, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    
    const text = await res.text();
    if (res.ok) {
      return { ok: true, status: res.status, text };
    }
    return { ok: false, status: res.status, text, error: `Direct API returned status ${res.status}` };
  } catch (err: any) {
    console.error('[Gajihub API] Stage 3 request failed:', err);
    const isCors = err instanceof TypeError && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'));
    return {
      ok: false,
      status: 0,
      text: '',
      error: `Semua jalur proxy dan langsung gagal terhubung ke Gajihub/Kledo API. Detail error: ${err.message || String(err)}`,
      isCorsError: isCors
    };
  }
}

/**
 * Fetches contacts/employees from Gajihub/Kledo API.
 */
export async function fetchGajihubEmployees(
  endpoint: string,
  token: string
): Promise<{ employees: GajihubEmployee[]; error?: string; isCorsError?: boolean }> {
  // Try /hr/schedules first as it is the direct, fully-authorized employee list endpoint for Gajihub PATs
  const hrSchedulesUrl = `${endpoint.replace(/\/$/, '')}/hr/schedules`;
  console.log(`[Gajihub API] Fetching employees via /hr/schedules: ${hrSchedulesUrl}`);
  
  let res = await fetchWithFallback(hrSchedulesUrl, 'GET', token);
  let isUsingHrSchedules = res.ok;

  // Fallback to contacts endpoint if /hr/schedules returns 404 or non-ok
  if (!res.ok) {
    const contactsUrl = `${endpoint.replace(/\/$/, '')}/contacts?type_id=3&limit=100`; // type_id 3 is Employee/Karyawan in Kledo
    console.log(`[Gajihub API] /hr/schedules failed. Falling back to contacts: ${contactsUrl}`);
    res = await fetchWithFallback(contactsUrl, 'GET', token);
  }
  
  if (!res.ok) {
    return { employees: [], error: res.error, isCorsError: res.isCorsError };
  }

  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch (e: any) {
    console.error("JSON parse error:", e, res.text);
    return {
      employees: [],
      error: `Gagal membaca response API. Format bukan JSON. Terbaca konten: "${res.text.substring(0, 250)}"`
    };
  }

  let rawContacts: any[] = [];
  if (json && Array.isArray(json.data)) {
    rawContacts = json.data;
  } else if (json && json.data && Array.isArray(json.data.data)) {
    rawContacts = json.data.data;
  } else if (json && Array.isArray(json)) {
    rawContacts = json;
  }

  const employees: GajihubEmployee[] = rawContacts.map((c: any) => {
    // Robust parsing that handles both /hr/schedules (with nested finance_contact) and /contacts schemas
    const id = String(c.id);
    const name = String(c.name || (c.finance_contact && c.finance_contact.name) || 'Karyawan');
    const email = c.finance_contact?.email || c.email || undefined;
    const phone = c.handphone || c.finance_contact?.phone || c.phone || undefined;
    const code = c.code || undefined;

    return {
      id,
      name,
      email,
      phone,
      code,
      type: 'Employee'
    };
  });

  return { employees };
}

/**
 * Synchronizes a single attendance record to Gajihub.
 */
export async function syncLogToGajihub(
  endpoint: string,
  token: string,
  payload: any
): Promise<{ success: boolean; response: string; error?: string; isCorsError?: boolean }> {
  const url = `${endpoint.replace(/\/$/, '')}/attendances`;
  
  const res = await fetchWithFallback(url, 'POST', token, payload);
  
  return {
    success: res.ok,
    response: res.text,
    error: res.ok ? undefined : (res.error || `HTTP ${res.status}: ${res.text.substring(0, 200)}`),
    isCorsError: res.isCorsError
  };
}

export interface GajihubAttendance {
  id: string;
  employee_id: string;
  date: string;
  check_in?: string | null;
  check_out?: string | null;
  status?: string;
  notes?: string;
}

/**
 * Fetches attendance data from Kledo / Gajihub API for a given date.
 */
export async function fetchGajihubAttendances(
  endpoint: string,
  token: string,
  date: string
): Promise<{ attendances: GajihubAttendance[]; error?: string; isCorsError?: boolean }> {
  const url = `${endpoint.replace(/\/$/, '')}/attendances?date=${date}&limit=100`;
  
  const res = await fetchWithFallback(url, 'GET', token);
  
  if (!res.ok) {
    return { attendances: [], error: res.error, isCorsError: res.isCorsError };
  }

  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch (e: any) {
    console.error("JSON parse error:", e, res.text);
    return {
      attendances: [],
      error: `Gagal membaca data kehadiran. Format bukan JSON. Terbaca konten: "${res.text.substring(0, 250)}"`
    };
  }

  let rawAttendances: any[] = [];
  if (json && Array.isArray(json.data)) {
    rawAttendances = json.data;
  } else if (json && json.data && Array.isArray(json.data.data)) {
    rawAttendances = json.data.data;
  } else if (json && Array.isArray(json)) {
    rawAttendances = json;
  }

  const attendances: GajihubAttendance[] = rawAttendances.map((a: any) => ({
    id: String(a.id),
    employee_id: String(a.employee_id),
    date: a.date || date,
    check_in: a.check_in || null,
    check_out: a.check_out || null,
    status: a.status || undefined,
    notes: a.notes || undefined
  }));

  return { attendances };
}
