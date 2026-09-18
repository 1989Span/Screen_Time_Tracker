// Where persisted state lives on the device.
//
// AsyncStorage is unencrypted key-value storage, which suits everything here:
// tracked categories, daily timers, the penalty setting and group membership.
// Nothing stored is a secret. If real money or auth tokens ever land in this
// app they belong in expo-secure-store, not here.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** Bump when a persisted shape changes incompatibly; `migrate` then runs. */
export const STORAGE_VERSION = 1;

/** Namespaced so the app never collides with another library's keys. */
export const storageKey = (name: string) => `gauge:${name}`;

/** JSON storage over AsyncStorage, shared by every persisted store. */
export const deviceStorage = createJSONStorage(() => AsyncStorage);
