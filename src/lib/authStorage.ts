import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSecureAuthStorage } from './secureAuthStorage';

// Old builds without this native module keep their existing adapter. Never
// fall back to plaintext when an installed Keychain is temporarily unreadable.
let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  SecureStore = null;
}

export const authStorage = Platform.OS !== 'web' && SecureStore
  ? createSecureAuthStorage(SecureStore, AsyncStorage)
  : AsyncStorage;
