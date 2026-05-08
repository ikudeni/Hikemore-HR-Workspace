import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, collection, addDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();
export const googleProvider = new GoogleAuthProvider();

export async function logActivity(action: string, details: Record<string, any>) {
  if (!auth.currentUser) return;
  const userName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'User';
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

    // Auto-delete logs older than 3 days
    try {
      const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
      const q = query(collection(db, 'logs'), where('timestamp', '<', threeDaysAgo.toISOString()));
      const snap = await getDocs(q);
      snap.forEach(d => {
        deleteDoc(d.ref).catch(() => {});
      });
    } catch (e) {
      console.error('Failed to cleanup old logs', e);
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
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: unknown) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

