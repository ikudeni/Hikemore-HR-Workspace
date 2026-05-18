import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, collection, addDoc, query, where, getDocs, deleteDoc, setDoc } from 'firebase/firestore';
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
  try {
    const fileId = Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7) + '_' + file.name;
    const storageRef = ref(storage, 'overtime_attachments/' + fileId);
    await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error) {
    console.error("Firebase Storage error", error);
    throw new Error("Gagal mengunggah file. Pastikan ukuran file wajar dan koneksi internet stabil.");
  }
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



