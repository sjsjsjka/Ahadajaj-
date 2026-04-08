import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, onSnapshot, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  credits: number;
  createdAt: Timestamp;
}

export interface PaymentRequest {
  id: string;
  uid: string;
  email: string;
  amount: number;
  credits: number;
  method: 'bkash' | 'nagad' | 'gumroad';
  transactionId: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: Timestamp;
}

export const signIn = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user profile exists
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      // Create default profile
      const profile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        role: 'user',
        credits: 0,
        createdAt: serverTimestamp() as Timestamp
      };
      await setDoc(doc(db, 'users', user.uid), profile);
    }
    return user;
  } catch (error) {
    console.error("Auth error:", error);
    throw error;
  }
};

export const signOut = () => auth.signOut();
