import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useApiKey } from '../context/ApiKeyContext';
import { MaterialIcons } from '@expo/vector-icons';
import DialogInput from 'react-native-dialog-input';
import { useUser } from '../context/UserContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define types for DialogInput props
interface DialogInputProps {
  isDialogVisible: boolean;
  title: string;
  message: string;
  hintInput: string;
  submitInput: (inputText: string) => void;
  closeDialog: () => void;
}

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [scannedApiKey, setScannedApiKey] = useState<string | null>(null);
  const router = useRouter();
  const { colors } = useTheme();
  const { setApiKey } = useApiKey();
  const { addUsername, username, updateUserApiKey, setUsername } = useUser();

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    // Prevent multiple scans while processing
    if (isProcessing || scanned) {
      return;
    }

    try {
      setIsProcessing(true);
      
      // Extract readkey from URL
      const url = new URL(data);
      const readkey = url.searchParams.get('readkey');
      
      if (!readkey) {
        throw new Error('No readkey found in QR code');
      }

      // Check if this API key is already associated with any profile
      const storedUsernames = await AsyncStorage.getItem('usernames');
      const usernames = storedUsernames ? JSON.parse(storedUsernames) : [];
      const userDataMap = await AsyncStorage.getItem('userDataMap');
      const userData = userDataMap ? JSON.parse(userDataMap) : {};
      
      const existingProfile = Object.entries(userData).find(([_, key]) => key === readkey);
      
      if (existingProfile) {
        // If the API key exists, automatically switch to that profile
        await setUsername(existingProfile[0]);
        Alert.alert(
          'Profile Switched',
          `Switched to existing profile "${existingProfile[0]}"`
        );
        router.back();
        return;
      }

      // If it's a new API key, store it temporarily and ask for a profile name
      setScannedApiKey(readkey);
      setScanned(true);
      setIsDialogVisible(true);
    } catch (error) {
      Alert.alert('Error', 'Invalid QR code format. Please scan a valid Electric Wave QR code.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUsernameSubmit = async (inputText: string) => {
    try {
      if (!scannedApiKey) {
        throw new Error('No API key available');
      }

      // Check if the username already exists
      const storedUsernames = await AsyncStorage.getItem('usernames');
      const usernames = storedUsernames ? JSON.parse(storedUsernames) : [];
      
      if (usernames.includes(inputText)) {
        // Update existing profile with new API key
        await updateUserApiKey(inputText, scannedApiKey);
        // Set this profile as active
        await setUsername(inputText);
        Alert.alert('Success', `Profile "${inputText}" has been updated with the new API key and set as active.`);
      } else {
        // Add new profile
        await addUsername(inputText, scannedApiKey);
        // Set this profile as active
        await setUsername(inputText);
        Alert.alert('Success', `Profile "${inputText}" has been added successfully and set as active.`);
      }

      setIsDialogVisible(false);
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    }
  };

  const handleCloseDialog = () => {
    // Clear the scanned API key if user cancels
    setScannedApiKey(null);
    setScanned(false);
    setIsDialogVisible(false);
  };

  const handleScanAgain = () => {
    setScanned(false);
    setScannedApiKey(null);
    setIsProcessing(false);
  };

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.text, { color: colors.text }]}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.text, { color: colors.text }]}>No access to camera</Text>
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={requestPermission}
        >
          <Text style={[styles.buttonText, { color: '#fff' }]}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Scan QR Code</Text>
        </View>
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned || isProcessing ? undefined : handleBarCodeScanned}
        >
          <View style={styles.overlay}>
            <View style={[styles.scanArea, { borderColor: colors.primary }]} />
          </View>
        </CameraView>

        {scanned && (
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={handleScanAgain}
          >
            <Text style={[styles.buttonText, { color: '#fff' }]}>Tap to Scan Again</Text>
          </TouchableOpacity>
        )}
      </View>

      <DialogInput
        isDialogVisible={isDialogVisible}
        title={"Set Profile Name"}
        message={"Please enter a name for this profile:"}
        hintInput={"Enter profile name"}
        submitInput={handleUsernameSubmit}
        closeDialog={handleCloseDialog}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  cameraContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderRadius: 12,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    margin: 16,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  text: {
    fontSize: 16,
    textAlign: 'center',
    margin: 16,
  },
});