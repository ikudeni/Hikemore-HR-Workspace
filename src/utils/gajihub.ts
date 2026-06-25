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
  employeeMappings: {},
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
 * Fetches contacts/employees from Gajihub/Kledo API.
 * Supports fallback mode if request is blocked by CORS.
 */
export async function fetchGajihubEmployees(
  endpoint: string,
  token: string
): Promise<{ employees: GajihubEmployee[]; error?: string; isCorsError?: boolean }> {
  const url = `${endpoint.replace(/\/$/, '')}/contacts?type_id=3&limit=100`; // type_id 3 is Employee/Karyawan in Kledo

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return { employees: [], error: `Server returned status ${response.status}: ${text || response.statusText}` };
    }

    const json = await response.json();
    
    // Handle standard Kledo envelope: usually data is inside json.data or json.contacts or directly json
    let rawContacts: any[] = [];
    if (json && Array.isArray(json.data)) {
      rawContacts = json.data;
    } else if (json && json.data && Array.isArray(json.data.data)) {
      rawContacts = json.data.data;
    } else if (json && Array.isArray(json)) {
      rawContacts = json;
    } else {
      console.log('Unrecognized API response structure, showing raw response:', json);
    }

    const employees: GajihubEmployee[] = rawContacts.map((c: any) => ({
      id: String(c.id),
      name: String(c.name),
      email: c.email || undefined,
      phone: c.phone || undefined,
      code: c.code || undefined,
      type: 'Employee'
    }));

    return { employees };
  } catch (error: any) {
    console.error('Fetch error:', error);
    // Detect typical client-side fetch failure (usually CORS or Offline)
    const isCors = error instanceof TypeError && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'));
    return {
      employees: [],
      error: error.message || String(error),
      isCorsError: isCors
    };
  }
}

/**
 * Synchronizes a single attendance record to Gajihub.
 */
export async function syncLogToGajihub(
  endpoint: string,
  token: string,
  payload: any
): Promise<{ success: boolean; response: string; error?: string; isCorsError?: boolean }> {
  // Gajihub/Kledo endpoint for attendance. We can try posting to "/attendances" or "/attendance" or "/attendance_logs"
  const url = `${endpoint.replace(/\/$/, '')}/attendances`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        success: false,
        response: responseText,
        error: `HTTP ${response.status}: ${response.statusText || 'Gagal'}`
      };
    }

    return {
      success: true,
      response: responseText
    };
  } catch (error: any) {
    console.error('Sync POST error:', error);
    const isCors = error instanceof TypeError && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'));
    return {
      success: false,
      response: '',
      error: error.message || String(error),
      isCorsError: isCors
    };
  }
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

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return { attendances: [], error: `Server returned status ${response.status}: ${text || response.statusText}` };
    }

    const json = await response.json();
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
  } catch (error: any) {
    console.error('Fetch attendances error:', error);
    const isCors = error instanceof TypeError && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'));
    return {
      attendances: [],
      error: error.message || String(error),
      isCorsError: isCors
    };
  }
}
