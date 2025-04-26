import React, { useState } from 'react';
import { Redirect } from 'expo-router';
import CustomSplashScreen from './screens/SplashScreen';

export default function Index() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <CustomSplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return <Redirect href="/(app)/home" />;
}
