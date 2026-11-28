// src/services/DeviceIdentityProvider.tsx
// Local-first device identity: generates a stable anonymous UUID on first launch.
// No sign-in, no Supabase, no account required.
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@daymark_device_owner_id_v1';

const createUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });

interface DeviceIdentityValue {
  deviceOwnerId: string;
  isReady: boolean;
}

const DeviceIdentityContext = createContext<DeviceIdentityValue | undefined>(undefined);

export const useDeviceIdentity = (): DeviceIdentityValue => {
  const ctx = useContext(DeviceIdentityContext);
  if (!ctx) throw new Error('useDeviceIdentity must be used within DeviceIdentityProvider');
  return ctx;
};

export const DeviceIdentityProvider = ({ children }: { children: ReactNode }) => {
  const [deviceOwnerId, setDeviceOwnerId] = useState<string>('guest');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
          id = createUuid();
          await AsyncStorage.setItem(DEVICE_ID_KEY, id);
        }
        if (mounted) {
          setDeviceOwnerId(id);
          setIsReady(true);
        }
      } catch {
        // Fallback: use a session-only UUID so app still works
        if (mounted) {
          setDeviceOwnerId(createUuid());
          setIsReady(true);
        }
      }
    };
    void init();
    return () => { mounted = false; };
  }, []);

  return (
    <DeviceIdentityContext.Provider value={{ deviceOwnerId, isReady }}>
      {children}
    </DeviceIdentityContext.Provider>
  );
};
