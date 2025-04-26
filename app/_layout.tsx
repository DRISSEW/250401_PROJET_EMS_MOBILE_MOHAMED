import { Slot } from 'expo-router';
import { ThemeProvider } from './context/ThemeContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LanguageProvider } from './context/LanguageContext';
import { ApiKeyProvider } from './context/ApiKeyContext';
import { StatusBar } from 'react-native';
import { UserProvider } from './context/UserContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <LanguageProvider>
          <ApiKeyProvider>
            <UserProvider>
              <StatusBar hidden />
              <Slot />
            </UserProvider>
          </ApiKeyProvider>
        </LanguageProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
} 