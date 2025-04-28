import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl, 
  ScrollView 
} from 'react-native';

import { format } from 'date-fns';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useApiKey } from '../context/ApiKeyContext';

interface FeedItem {
  id: string;
  name: string;
  tag: string;
  value: string | number;
  time: number;
}

interface GroupedData {
  tag: string;
  items: FeedItem[];
  expanded: boolean;
}

const API_URL = 'http://electricwave.ma/energymonitoring/feed/list.json';



const dashboards = [
  { name: 'Multipuissance', id: '1', feednames: ['P_PH2', 'P_TOTALE','P_PH3', 'P_PH1','P1','P2','P3','PT'] },
  { name: 'MultiCourant', id: '2', feednames: ['I1', 'I2', 'I3', 'i1', 'i2', 'i3'] },
  { name: 'Equilibrage', id: '3', feednames: ['I1', 'I2', 'I3', 'i1', 'i2', 'i3'] },
  { name: 'Temperature', id: '4', feednames: ['TEMP1', 'TEMP2', 'TEMP_26'] },
  { name: 'Consommation', id: '5', feednames: ['ENERGY'] },
];

const Dashboards = () => {
  const { apiKey } = useApiKey();
  const { colors } = useTheme();
  const [groupedData, setGroupedData] = useState<GroupedData[]>([]);
  const [liveValues, setLiveValues] = useState<{ [key: string]: number | string }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}?apikey=${apiKey}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data: FeedItem[] = await response.json();

      const grouped: GroupedData[] = dashboards.map(dashboard => {
        const items = data.filter(feed => dashboard.feednames.includes(feed.name));
        return {
          tag: dashboard.name,
          items,
          expanded: false,
        };
      });

      const initialValues: { [key: string]: number | string } = {};
      data.forEach(feed => {
        initialValues[feed.id] = feed.value;
      });

      setGroupedData(grouped);
      setLiveValues(initialValues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiKey]);

  const fetchLiveValues = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}?apikey=${apiKey}`);
      if (!response.ok) throw new Error('Live value fetch failed');
      const data: FeedItem[] = await response.json();

      const newValues: { [key: string]: number | string } = {};
      data.forEach(feed => {
        newValues[feed.id] = feed.value;
      });

      setLiveValues(prev => ({ ...prev, ...newValues }));
    } catch (err) {
      console.error('Error updating live values:', err);
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey) fetchInitialData();
  }, [fetchInitialData, apiKey]);

  useEffect(() => {
    if (apiKey) {
      fetchLiveValues();
      const interval = setInterval(fetchLiveValues, 100);
      return () => clearInterval(interval);
    }
  }, [fetchLiveValues, apiKey]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchInitialData();
  };

  const toggleExpand = (index: number) => {
    const updated = [...groupedData];
    updated[index].expanded = !updated[index].expanded;
    setGroupedData(updated);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  const formatTime = (timestamp: number) => {
    return format(new Date(timestamp * 1000), 'dd/MM/yyyy HH:mm');
  };

  if (!apiKey) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Dashboards</Text>
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
        <TouchableOpacity 
          style={[styles.refreshButton, { backgroundColor: colors.primary }]} 
          onPress={fetchInitialData}
        >
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Dashboards</Text>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {groupedData.map((group, index) => (
          <View key={group.tag} style={[styles.groupContainer, { backgroundColor: colors.surface }]}>
            <TouchableOpacity 
              style={styles.groupHeader} 
              onPress={() => toggleExpand(index)}
            >
              <Text style={[styles.groupTitle, { color: colors.text }]}>{group.tag}</Text>
              <MaterialIcons 
                name={group.expanded ? 'expand-less' : 'expand-more'} 
                size={24} 
                color={colors.text} 
              />
            </TouchableOpacity>

            {group.expanded && group.items.map(item => (
              <View
                key={item.id}
                style={[
                  styles.itemContainer,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: selectedIds.includes(item.id)
                      ? colors.primary + '20'
                      : 'transparent'
                  }
                ]}
              >
                <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.itemValue, { color: colors.text }]}>
                  Value: {liveValues[item.id] ?? item.value}
                </Text>
                <Text style={[styles.itemTime, { color: colors.text }]}>
                  Time: {formatTime(item.time)}
                </Text>
              </View>
            ))}

            {group.expanded && (
              <TouchableOpacity
                style={[styles.visualizeButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const items = group.items.map(item => ({
                    id: item.id,
                    name: item.name,
                  }));
                
                  router.push({
                    pathname: '/dashboardcharts',
                    params: {
                      items: JSON.stringify(items),
                      liveValues: JSON.stringify(liveValues),
                      dashboardName: group.tag, // Add this line to pass the dashboard name
                    },
                  });
                }}
              >
                <Text style={[styles.visualizeButtonText, { color: colors.icon }]}>Visualize</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16 },
  errorText: { fontSize: 16, marginBottom: 20 },
  backButton: { marginRight: 16 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  refreshButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4 },
  refreshButtonText: { fontWeight: 'bold' },
  scrollView: { flex: 1 },
  groupContainer: {
    marginBottom: 10,
    borderRadius: 8,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 10,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  groupTitle: { fontSize: 18, fontWeight: 'bold' },
  itemContainer: { padding: 16, borderBottomWidth: 1 },
  itemName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  itemValue: { fontSize: 14, marginBottom: 2 },
  itemTime: { fontSize: 12 },
  visualizeButton: {
    margin: 16,
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  visualizeButtonText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default Dashboards;
