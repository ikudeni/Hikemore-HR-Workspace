import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, collection, addDoc, query, where, getDocs, deleteDoc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

export function getLocalUser() {
  try {
    const data = sessionStorage.getItem('currentUser');
    if (data) return JSON.parse(data);
  } catch(e) {}
  return null;
}

export const auth = {
  get currentUser() {
    return getLocalUser();
  },
  signOut: async () => {
    sessionStorage.removeItem('currentUser');
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64Data = e.target?.result as string;
        const CHUNK_SIZE = 800000; // < 1MB limit for Firestore doc
        const docId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);
        
        if (base64Data.length <= CHUNK_SIZE) {
          await setDoc(doc(db, 'fileContents', docId), { base64: base64Data });
        } else {
          // split into chunks and upload in parallel for speed
          const numChunks = Math.ceil(base64Data.length / CHUNK_SIZE);
          await setDoc(doc(db, 'fileContents', docId), { parts: numChunks, type: file.type, name: file.name });
          
          const promises = [];
          // we can upload up to 20 chunks at a time to avoid overwhelming connection
          for (let i = 0; i < numChunks; i++) {
             const chunk = base64Data.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
             promises.push(setDoc(doc(db, 'fileContents', docId, 'chunks', i.toString()), { data: chunk }));
          }
          // Batch wait for them to finish
          while(promises.length > 0) {
            await Promise.all(promises.splice(0, 10));
          }
        }
        
        resolve(`DB_STORED:${docId}`);
      } catch (error) {
        console.error("Firestore upload error", error);
        reject(new Error("Gagal mengunggah file. Pastikan ukuran file wajar dan koneksi stabil."));
      }
    };
    reader.onerror = () => reject(new Error("Gagal membaca file dari perangkat."));
    reader.readAsDataURL(file);
  });
}

export async function getFileFromFirestore(docId: string): Promise<string | null> {
  try {
    const docSnap = await getDocFromServer(doc(db, 'fileContents', docId));
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    if (data.base64) return data.base64;
    
    if (data.parts) {
      const promises = [];
      for(let i=0; i<data.parts; i++){
        promises.push(getDocFromServer(doc(db, 'fileContents', docId, 'chunks', i.toString())));
      }
      const snaps = await Promise.all(promises);
      let full = '';
      for (const snap of snaps) {
        if (snap.exists()) {
          full += snap.data().data;
        }
      }
      return full;
    }
  } catch(e) {
    console.error("Error getFileFromFirestore", e);
  }
  return null;
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



