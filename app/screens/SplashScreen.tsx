import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Dimensions,Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import * as ExpoSplashScreen from 'expo-splash-screen';

// Prevent the default splash screen from showing
ExpoSplashScreen.preventAutoHideAsync();

const { height } = Dimensions.get('window');

const CustomSplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const { colors, isDarkMode } = useTheme();

  useEffect(() => {
    // Hide the default splash screen
    ExpoSplashScreen.hideAsync();

    // Simulate loading time (2 seconds)
    const timer = setTimeout(() => {
      onFinish();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onFinish]);

  // Log the image paths for debugging
  console.log('Dark mode:', isDarkMode);
  console.log('Image path:', isDarkMode ? '../../assets/images/logo-light.png' : '../../assets/images/logo-dark.png');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"flex-start",position:"relative"}}>
              <Image 
                style={{width: 40,height: 40,position:"relative"}}
                source={require('../../assets/images/icon.png')}
              />
              <Text style={{fontSize: 24,fontWeight: 'bold',color: colors.text,position:"relative"}}>EMS</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    height: height * 0.5, // Take up half the screen height
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%', // Ensure container takes full width
  },
  logo: {
    width: '80%',
    height: '80%',
    maxWidth: 300, // Add maximum width
    maxHeight: 300, // Add maximum height
  },
  logoText: {
    fontSize: 24,
    fontWeight: 'bold',
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
});

export default CustomSplashScreen; 