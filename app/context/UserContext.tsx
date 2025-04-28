import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApiKey } from './ApiKeyContext';

interface UserData {
  username: string;
  apiKey: string;
}

interface UserContextProps {
  username: string;
  usernames: string[];
  setUsername: (username: string) => Promise<void>;
  addUsername: (username: string, apiKey: string) => Promise<void>;
  removeUsername: (username: string) => Promise<void>;
  getUserApiKey: (username: string) => string | null;
  updateUserApiKey: (username: string, apiKey: string) => Promise<void>;
}

const UserContext = createContext<UserContextProps | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [username, setUsernameState] = useState('');
  const [usernames, setUsernamesState] = useState<string[]>([]);
  const [userDataMap, setUserDataMap] = useState<Map<string, string>>(new Map());
  const { setApiKey } = useApiKey();

  // Load all data from AsyncStorage on app start
  useEffect(() => {
    const loadData = async () => {
      try {
        const [storedUsername, storedUsernames, storedUserData] = await Promise.all([
          AsyncStorage.getItem('currentUsername'),
          AsyncStorage.getItem('usernames'),
          AsyncStorage.getItem('userDataMap')
        ]);

        if (storedUsername) {
          setUsernameState(storedUsername);
        }

        if (storedUsernames) {
          setUsernamesState(JSON.parse(storedUsernames));
        }

        if (storedUserData) {
          const parsedData = JSON.parse(storedUserData);
          setUserDataMap(new Map(Object.entries(parsedData)));
          
          // Set the API key for the current username
          const currentApiKey = parsedData[storedUsername];
          if (currentApiKey) {
            await setApiKey(currentApiKey);
          }
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };

    loadData();
  }, []);

  // Save username to AsyncStorage and state
  const setUsername = async (newUsername: string) => {
    try {
      setUsernameState(newUsername);
      await AsyncStorage.setItem('currentUsername', newUsername);
      
      // Set the API key for the new username
      const apiKey = userDataMap.get(newUsername);
      if (apiKey) {
        await setApiKey(apiKey);
      } else {
        // Clear the API key if no profile is selected or profile has no API key
        await setApiKey('');
        console.warn(`No API key found for username: ${newUsername}`);
      }
    } catch (error) {
      console.error('Error setting username:', error);
      throw error;
    }
  };

  // Add new username with API key
  const addUsername = async (newUsername: string, apiKey: string) => {
    try {
      if (!usernames.includes(newUsername)) {
        const updatedUsernames = [...usernames, newUsername];
        setUsernamesState(updatedUsernames);
        
        // Update user data map
        const updatedMap = new Map(userDataMap);
        updatedMap.set(newUsername, apiKey);
        setUserDataMap(updatedMap);
        
        // Save to AsyncStorage
        await Promise.all([
          AsyncStorage.setItem('usernames', JSON.stringify(updatedUsernames)),
          AsyncStorage.setItem('userDataMap', JSON.stringify(Object.fromEntries(updatedMap)))
        ]);
      }
    } catch (error) {
      console.error('Error adding username:', error);
      throw error;
    }
  };

  // Update API key for an existing username
  const updateUserApiKey = async (username: string, apiKey: string) => {
    try {
      if (usernames.includes(username)) {
        // Update user data map
        const updatedMap = new Map(userDataMap);
        updatedMap.set(username, apiKey);
        setUserDataMap(updatedMap);
        
        // Save to AsyncStorage
        await AsyncStorage.setItem('userDataMap', JSON.stringify(Object.fromEntries(updatedMap)));
        
        // If this is the current username, update the active API key
        if (username === username) {
          await setApiKey(apiKey);
        }
      }
    } catch (error) {
      console.error('Error updating API key:', error);
      throw error;
    }
  };

  // Remove username and its API key
  const removeUsername = async (usernameToRemove: string) => {
    try {
      const updatedUsernames = usernames.filter(u => u !== usernameToRemove);
      setUsernamesState(updatedUsernames);
      
      // Update user data map
      const updatedMap = new Map(userDataMap);
      updatedMap.delete(usernameToRemove);
      setUserDataMap(updatedMap);
      
      // Save to AsyncStorage
      await Promise.all([
        AsyncStorage.setItem('usernames', JSON.stringify(updatedUsernames)),
        AsyncStorage.setItem('userDataMap', JSON.stringify(Object.fromEntries(updatedMap)))
      ]);
      
      // If the removed username was the current one, clear the API key and set to the first available username or empty
      if (usernameToRemove === username) {
        await setApiKey(''); // Clear the API key
        const newUsername = updatedUsernames[0] || '';
        await setUsername(newUsername);
      }
    } catch (error) {
      console.error('Error removing username:', error);
      throw error;
    }
  };

  // Get API key for a specific username
  const getUserApiKey = (username: string): string | null => {
    return userDataMap.get(username) || null;
  };

  return (
    <UserContext.Provider value={{ 
      username, 
      usernames, 
      setUsername, 
      addUsername, 
      removeUsername,
      getUserApiKey,
      updateUserApiKey
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};