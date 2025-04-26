import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';

type Theme = 'light' | 'dark' | 'system';

interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  primary: string;
  secondary: string;
  accent: string;
  border: string;
  shadow: string;
  error: string;
  icon: string;
  switch: string;
}

export const lightColors: ThemeColors = {
  background: '#f8f9fa',
  surface: '#ffffff',
  text: '#2d3436',
  textSecondary: '#636e72',
  primary: '#87BCDE',
  secondary: '#F9A620',
  accent: '#548C2F',
  border: '#e0e0e0',
  shadow: '#000',
  error: '#dc3545',
  icon: '#fff',
  switch: 'rgba(133, 99, 99, 0.82)',
};

export const darkColors: ThemeColors = {
  background: '#1a1a1a',
  surface: '#2d2d2d',
  text: '#ffffff',
  textSecondary: '#a0a0a0',
  primary: '#87BCDE',
  secondary: '#F9A620',
  accent: '#EAFDCF',
  border: '#404040',
  shadow: '#000',
  error: '#ff6b6b',
  icon: '#000',
  switch: 'rgba(133, 99, 99, 0.82)',
};

interface ThemeContextType {
  theme: Theme;
  isDarkMode: boolean;
  setTheme: (theme: Theme) => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [theme, setTheme] = useState<Theme>('system');

  const isDarkMode = theme === 'system' 
    ? systemColorScheme === 'dark'
    : theme === 'dark';

  const colors = isDarkMode ? darkColors : lightColors;

  useEffect(() => {
    // You can add any theme-related side effects here
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, setTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeProvider; 