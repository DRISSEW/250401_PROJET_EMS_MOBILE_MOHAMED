import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TextInput
} from 'react-native';

import { format } from 'date-fns';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useApiKey } from '../context/ApiKeyContext';
import { fetchFeeds } from '../services/api';
import { Feed } from '../types';

interface FeedItem extends Feed {
  time: number;
}

const DropDownMenu = () => {
  const { apiKey } = useApiKey();
  const { colors } = useTheme();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<FeedItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!apiKey) {
      setError('API key is required');
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const feeds = await fetchFeeds(apiKey);
      setFeedItems(feeds.map(feed => ({ ...feed, time: Date.now() })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiKey]);

  const updateValuesOnly = useCallback(async () => {
    if (!apiKey) return;
    try {
      const updatedFeeds = await fetchFeeds(apiKey);
      setFeedItems(prevItems =>
        prevItems.map(item => {
          const updated = updatedFeeds.find(f => f.id === item.id);
          return updated ? { ...updated, time: Date.now() } : item;
        })
      );
    } catch (err) {
      console.error('Live value update error:', err);
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey) fetchData();
  }, [fetchData, apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    const intervalId = setInterval(updateValuesOnly, 1000);
    return () => clearInterval(intervalId);
  }, [apiKey, updateValuesOnly]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredItems(feedItems);
    } else {
      const filtered = feedItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredItems(filtered);
    }
  }, [searchQuery, feedItems]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleItemPress = (id: string, name: string) => {
    router.push({
      pathname: '/chart',
      params: { 
        selectedIds: JSON.stringify([id]),
        itemName: name
      }
    });
  };

  const formatTime = (timestamp: number) =>
    format(new Date(timestamp * 1000), 'dd/MM/yyyy HH:mm');

  if (!apiKey) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                  <MaterialIcons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Feeds</Text>
              </View>
      
              <View style={[styles.centered, { backgroundColor: colors.background }]}>
                <TouchableOpacity 
                  style={[styles.refreshButton, { backgroundColor: colors.error }]} 
                  onPress={() => router.push('/qrscanner')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' ,gap: 10}}>
                    <MaterialIcons name="qr-code-scanner" size={24} color={colors.icon} />
                    <Text style={[styles.refreshButtonText, { color: colors.icon }]}>Connect Your Account</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
    );
  }

  if (loading && !refreshing) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.text }]}>Loading data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Error: {error}</Text>
        <TouchableOpacity style={[styles.refreshButton, { backgroundColor: colors.primary }]} onPress={fetchData}>
          <Text style={[styles.refreshButtonText, { color: colors.icon }]}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Feeds</Text>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.surface }]}>
        <MaterialIcons name="search" size={24} color={colors.text} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.itemContainer, { backgroundColor: colors.surface }]}
            onPress={() => handleItemPress(item.id, item.name)}
          >
            <View style={styles.itemContent}>
              <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.itemValue, { color: colors.textSecondary }]}>
                Value: {item.value}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={colors.text} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  backButton: { marginRight: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16 },
  errorText: { fontSize: 16, marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  refreshButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4 },
  refreshButtonText: { fontWeight: 'bold' },
  scrollView: { flex: 1 },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41
  },
  itemContent: {
    flex: 1
  },
  itemName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  itemValue: { fontSize: 14 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0
  }
});

export default DropDownMenu;
