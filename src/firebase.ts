import { initializeApp } from 'firebase/app';
import { getFirestore, Timestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
