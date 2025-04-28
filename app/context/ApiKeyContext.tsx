import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

interface ApiKeyContextType {
  apiKey: string | null;
  setApiKey: (key: string | null) => Promise<void>;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null);

  useEffect(() => {
    // Load API key from secure storage on mount
    const loadApiKey = async () => {
      try {
        const storedKey = await SecureStore.getItemAsync('apiKey');
        if (storedKey) {
          setApiKeyState(storedKey);
        }
      } catch (error) {
        console.error('Failed to load API key:', error);
      }
    };

    loadApiKey();
  }, []);

  const setApiKey = async (key: string | null) => {
    try {
      if (key) {
        await SecureStore.setItemAsync('apiKey', key);
      } else {
        await SecureStore.deleteItemAsync('apiKey');
      }
      setApiKeyState(key);
    } catch (error) {
      console.error('Failed to save API key:', error);
    }
  };

  return (
    <ApiKeyContext.Provider value={{ apiKey, setApiKey }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error('useApiKey must be used within an ApiKeyProvider');
  }
  return context;
}

export default ApiKeyProvider; 