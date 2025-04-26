import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';
// import { useAuth } from '../context/AuthContext';
import { router } from 'expo-router';
import { useLanguage } from '../context/LanguageContext';

export const SettingsScreen = () => {
  const { theme, setTheme, colors } = useTheme();
  // const { signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
  };

  const handleLogout = async () => {
    try {
      // await signOut();
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('Error logging out:', error);
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
            <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
          </View>
        </View>

        <ScrollView>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings.appearance')}</Text>
            
            <TouchableOpacity 
              style={[styles.settingItem, { backgroundColor: colors.surface }]}
              onPress={() => handleThemeChange('light')}
            >
              <View style={styles.settingContent}>
                <MaterialIcons name="light-mode" size={24} color={colors.textSecondary} />
                <Text style={[styles.settingText, { color: colors.text }]}>{t('settings.lightMode')}</Text>
              </View>
              {theme === 'light' && (
                <MaterialIcons name="check" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingItem, { backgroundColor: colors.surface }]}
              onPress={() => handleThemeChange('dark')}
            >
              <View style={styles.settingContent}>
                <MaterialIcons name="dark-mode" size={24} color={colors.textSecondary} />
                <Text style={[styles.settingText, { color: colors.text }]}>{t('settings.darkMode')}</Text>
              </View>
              {theme === 'dark' && (
                <MaterialIcons name="check" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingItem, { backgroundColor: colors.surface }]}
              onPress={() => handleThemeChange('system')}
            >
              <View style={styles.settingContent}>
                <MaterialIcons name="settings" size={24} color={colors.textSecondary} />
                <Text style={[styles.settingText, { color: colors.text }]}>{t('settings.systemDefault')}</Text>
              </View>
              {theme === 'system' && (
                <MaterialIcons name="check" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings.language')}</Text>
            
            <TouchableOpacity 
              style={[styles.settingItem, { backgroundColor: colors.surface }]}
              onPress={() => setLanguage('en')}
            >
              <View style={styles.settingContent}>
                <MaterialIcons name="language" size={24} color={colors.textSecondary} />
                <Text style={[styles.settingText, { color: colors.text }]}>{t('settings.english')}</Text>
              </View>
              {language === 'en' && (
                <MaterialIcons name="check" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.settingItem, { backgroundColor: colors.surface }]}
              onPress={() => setLanguage('fr')}
            >
              <View style={styles.settingContent}>
                <MaterialIcons name="language" size={24} color={colors.textSecondary} />
                <Text style={[styles.settingText, { color: colors.text }]}>{t('settings.french')}</Text>
              </View>
              {language === 'fr' && (
                <MaterialIcons name="check" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings.account')}</Text>
            <TouchableOpacity 
              style={[styles.settingItem, { backgroundColor: colors.surface }]}
              // onPress={handleLogout}
            >
              <View style={styles.settingContent}>
                <MaterialIcons name="logout" size={24} color={colors.error} />
                <Text style={[styles.settingText, { color: colors.error }]}>{t('settings.logout')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

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
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    fontSize: 16,
    marginLeft: 12,
  },
});

export default SettingsScreen; 