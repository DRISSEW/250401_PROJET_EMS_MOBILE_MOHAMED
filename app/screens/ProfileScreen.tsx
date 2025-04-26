import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useUser } from '../context/UserContext';
import { useTheme } from '../context/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApiKey } from '../context/ApiKeyContext';

export default function ProfileScreen() {
  const { username, usernames, setUsername, removeUsername, getUserApiKey } = useUser();
  const { colors } = useTheme();
  const { apiKey, setApiKey } = useApiKey();

  // Ensure the current API key is set when the component mounts
  useEffect(() => {
    const currentApiKey = getUserApiKey(username);
    if (currentApiKey && currentApiKey !== apiKey) {
      setApiKey(currentApiKey);
    }
  }, [username]);

  const handleRemoveUsername = async (usernameToRemove: string) => {
    Alert.alert(
      'Remove Profile',
      `Are you sure you want to remove ${usernameToRemove}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: async () => {
            await removeUsername(usernameToRemove);
          }
        }
      ]
    );
  };

  const handleAddProfile = () => {
    router.push('/screens/QRScannerScreen');
  };

  const handleSwitchProfile = async (newUsername: string) => {
    const newApiKey = getUserApiKey(newUsername);
    if (newApiKey) {
      await setUsername(newUsername);
      // The API key will be automatically set by the UserContext
    } else {
      Alert.alert('Error', 'No API key found for this profile. Please scan a QR code to add one.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.content, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.headerContent}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <MaterialIcons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Profiles</Text>
          </View>
        </View>

        <ScrollView style={styles.scrollView}>
          <View style={styles.accountsSection}>
            {usernames.map((name) => (
              <View 
                key={name} 
                style={[
                  styles.accountBlock, 
                  { 
                    backgroundColor: colors.surface,
                    borderColor: name === username ? colors.accent : colors.border
                  }
                ]}
              >
                <View style={styles.accountInfo}>
                  <View style={[styles.avatarContainer, { backgroundColor: name === username ? colors.accent : colors.border }]}>
                    <MaterialIcons name="person" size={24} color={name === username ? colors.background : colors.text} />
                  </View>
                  <View>
                    <Text style={[styles.accountName, { color: colors.text }]}>{name}</Text>
                    
                  </View>
                </View>
                <View style={styles.accountActions}>
                  {name === username ? (
                    <Text style={[styles.activeLabel, { color: colors.accent }]}>Active</Text>
                  ) : (
                    <TouchableOpacity
                      style={[styles.switchButton, { backgroundColor: colors.error }]}
                      onPress={() => handleSwitchProfile(name)}
                    >
                      <Text style={[styles.switchButtonText, { color: colors.background }]}>Switch</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveUsername(name)}
                  >
                    <MaterialIcons name="delete" size={20} color="tomato" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.addAccountButton, { backgroundColor: colors.surface }]}
              onPress={handleAddProfile}
            >
              <MaterialIcons name="add" size={24} color={colors.text} />
              <Text style={[styles.addAccountText, { color: colors.text }]}>Add Profile</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
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
  scrollView: {
    flex: 1,
  },
  accountsSection: {
    padding: 16,
  },
  accountBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  apiKeyText: {
    fontSize: 12,
  },
  accountActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 12,
  },
  switchButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 12,
  },
  switchButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  removeButton: {
    padding: 4,
  },
  addAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  addAccountText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});