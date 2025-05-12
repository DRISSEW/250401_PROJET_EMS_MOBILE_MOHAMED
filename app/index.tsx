import React, { useState } from 'react';
import { Redirect,Tabs } from 'expo-router';
import CustomSplashScreen from './screens/SplashScreen';


export default function Index() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <CustomSplashScreen onFinish={() => setShowSplash(false)} />;
  }

  // Your splash/index.tsx
  return <Redirect href="/(app)/home" />;
}
