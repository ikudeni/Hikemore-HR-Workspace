import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, collection, addDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

export function getLocalUser() {
  try {
    const data = localStorage.getItem('currentUser');
    if (data) return JSON.parse(data);
  } catch(e) {}
  return null;
}

export const auth = {
  get currentUser() {
    return getLocalUser();
  },
  signOut: async () => {
    localStorage.removeItem('currentUser');
  }
} as any;

export async function logActivity(action: string, details: Record<string, any>) {
  const user = getLocalUser();
  if (!user) return;
  const userName = user.name || user.username || 'User';
  try {
    const cleanDetails = Object.fromEntries(
      Object.entries(details).map(([k, v]) => [k, v == null ? '-' : String(v)])
    );

    const now = new Date();
    await addDoc(collection(db, 'logs'), {
      action,
      userName,
      details: cleanDetails,
      timestamp: now.toISOString()
    });

    // Auto-delete logs older than 3 days - run only sometimes to save quota/performance
    if (Math.random() < 0.05) {
      (async () => {
        try {
          const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
          const q = query(collection(db, 'logs'), where('timestamp', '<', threeDaysAgo.toISOString()));
          const snap = await getDocs(q);
          const deletePromises = snap.docs.map(d => deleteDoc(d.ref).catch(() => {}));
          await Promise.all(deletePromises);
        } catch (e) {
          console.error('Failed to cleanup old logs', e);
        }
      })();
    }
  } catch (error) {
    console.error("Failed to add activity log", error);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export async function uploadFileToFirestore(file: File): Promise<string> {
  // Read file as base64
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async (ev) => {
      const base64Data = ev.target?.result as string;
      
      // Rough check if base64 exceeds Firestore 1MB document limit
      // 1MB = 1,048,576 bytes. Provide a safe buffer (e.g. 900KB)
      if (base64Data.length > 950000) {
          reject(new Error(`Ukuran file terlalu besar untuk sistem. Mohon unggah file kurang dari 700KB.`));
          return;
      }
      
      try {
        const docId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'fileContents', docId), { base64: base64Data });
        // Return a special protocol string so we know it's stored in the DB
        resolve(`DB_STORED:${docId}`);
      } catch (error) {
        console.error("Firestore DB Storage error", error);
        reject(new Error("Gagal mengunggah file ke database."));
      }
    };
    reader.onerror = () => reject(new Error("Gagal membaca file lokal."));
    reader.readAsDataURL(file);
  });
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const user = getLocalUser();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: user ? { username: user.username } : null,
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}



