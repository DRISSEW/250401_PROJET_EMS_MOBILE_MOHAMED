import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, SafeAreaView, Pressable, Alert } from 'react-native';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useApiKey } from '../context/ApiKeyContext';

const API_URL = 'http://electricwave.ma/energymonitoring/feed/list.json';

export const HomeScreen = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const router = useRouter();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { apiKey } = useApiKey();
  const [energyValue, setEnergyValue] = useState<number>(0);
  const [yesterdayEnergyValue, setYesterdayEnergyValue] = useState<number>(0);
  const [dailyConsumption, setDailyConsumption] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const [liveUpdateInterval, setLiveUpdateInterval] = useState<number>(5); // seconds
  const [lastEnergyValue, setLastEnergyValue] = useState<number>(0);
  const [midnightEnergyValue, setMidnightEnergyValue] = useState<number>(0);
  const [isLiveUpdating, setIsLiveUpdating] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch live energy value and yesterday's value
  useEffect(() => {
    const fetchEnergyValues = async () => {
      if (!apiKey) return;
      
      try {
        // Fetch current energy value
        const response = await fetch(`${API_URL}?apikey=${apiKey}`);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        
        // Find the ENERGY feed
        const energyFeed = data.find((feed: any) => feed.name === 'ENERGY');
        if (energyFeed) {
          const currentValue = Number(energyFeed.value);
          setEnergyValue(currentValue);
          setLastEnergyValue(currentValue);
          console.log('Current value:', currentValue);
          
          // Get today's midnight timestamp (00:00)
          const now = new Date();
          const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const todayMidnightMs = todayMidnight.getTime();
          const nowMs = now.getTime();
          
          try {
            // Fetch today's midnight value
            const todayResponse = await fetch(
              `http://electricwave.ma/energymonitoring/feed/data.json?id=${energyFeed.id}&start=${todayMidnightMs}&end=${nowMs}&interval=86400&apikey=${apiKey}`
            );
            
            if (todayResponse.ok) {
              const todayData = await todayResponse.json();
              if (todayData && todayData.length > 0) {
                // Get the value at midnight
                const midnightValue = Number(todayData[0][1]);
                setMidnightEnergyValue(midnightValue);
                console.log('Midnight value:', midnightValue);
                
                // Calculate today's consumption as the difference from midnight to now
                const todayConsumption = currentValue - midnightValue;
                setDailyConsumption(todayConsumption);
                console.log('Today consumption:', todayConsumption);
                
                // For backward compatibility, also fetch yesterday's value
                const yesterday = Math.floor(Date.now() / 1000) - (24 * 60 * 60); // 24 hours ago
          const startMs = yesterday * 1000;
                const endMs = nowMs;
          
            const historyResponse = await fetch(
              `http://electricwave.ma/energymonitoring/feed/data.json?id=${energyFeed.id}&start=${startMs}&end=${endMs}&interval=86400&apikey=${apiKey}`
            );
            
            if (historyResponse.ok) {
              const historyData = await historyResponse.json();
              if (historyData && historyData.length > 0) {
                // Get the first value from yesterday
                const yesterdayValue = Number(historyData[0][1]);
                setYesterdayEnergyValue(yesterdayValue);
                  }
                }
              }
            }
          } catch (historyErr) {
            console.error('Error fetching historical energy value:', historyErr);
          }
        }
      } catch (err) {
        console.error('Error fetching energy value:', err);
      } finally {
        setLoading(false);
        setLastUpdateTime(new Date());
      }
    };

    fetchEnergyValues();
    const interval = setInterval(fetchEnergyValues, 60000); // Update every minute for full data refresh
    return () => clearInterval(interval);
  }, [apiKey]);

  // Live update effect for real-time changes
  useEffect(() => {
    if (!apiKey || loading || !midnightEnergyValue) return;
    
    const liveUpdate = async () => {
      try {
        // Fetch only the current value for quick updates
        const response = await fetch(`${API_URL}?apikey=${apiKey}`);
        if (!response.ok) return;
        
        const data = await response.json();
        const energyFeed = data.find((feed: any) => feed.name === 'ENERGY');
        
        if (energyFeed) {
          const currentValue = Number(energyFeed.value);
          
          // Only update if the value has changed
          if (currentValue !== lastEnergyValue) {
            setLastEnergyValue(currentValue);
            setEnergyValue(currentValue);
            
            // Calculate updated consumption
            const updatedConsumption = currentValue - midnightEnergyValue;
            setDailyConsumption(updatedConsumption);
            
            // Update the last update time
            setLastUpdateTime(new Date());
          }
        }
      } catch (err) {
        console.error('Error in live update:', err);
      }
    };

    // Start live updates
    setIsLiveUpdating(true);
    const liveInterval = setInterval(liveUpdate, liveUpdateInterval * 1000);
    
    return () => {
      clearInterval(liveInterval);
      setIsLiveUpdating(false);
    };
  }, [apiKey, loading, midnightEnergyValue, lastEnergyValue, liveUpdateInterval]);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return t('home.morning');
    if (hour < 18) return t('home.afternoon');
    if (hour < 22) return t('home.evening');
    return t('home.night');
  };

  const formatTime = () => {
    return currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleAction = (action: string) => {
    switch (action) {
      case 'charts':
        router.push('/dropdown');
        break;
      case 'qrscanner':
        router.push('/qrscanner');
        break;
      case 'settings':
        router.push('/settings');
        break;
      case 'profile':
        router.push('/profile');
        break;
      case 'dashboard':
        router.push('/dashboards');
        break;
      case 'reports':
        Alert.alert('Reports', 'Opening reports...');
        break;
      default:
        break;
    }
  };

  // Calculate current usage (daily consumption divided by 1000)
  const currentUsage = (dailyConsumption ).toFixed(2);
  
  // Calculate daily cost (daily consumption multiplied by 1.15)
  const dailyCost = (Number(currentUsage) * 1.7).toFixed(2);

  // Format the last update time
  const formatLastUpdate = () => {
    return lastUpdateTime.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.content, { backgroundColor: colors.background }]}>
        <ScrollView>
          <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"flex-start",position:"relative"}}>
              <Image 
                style={{width: 40,height: 40,position:"relative"}}
                source={require('../../assets/images/icon.png')}
              />
              <Text style={{fontSize: 24,fontWeight: 'bold',color: colors.text,position:"relative"}}>EMS</Text>
            </View>
            <Text style={[styles.date, { color: colors.textSecondary }]}>{formatDate(currentTime)}</Text>
          </View>

          <View style={styles.metricsContainer}>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <View style={styles.metricHeader}>
                <MaterialIcons name="power" size={24} color={colors.primary} />
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Current Usage</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.primary }]}>{loading ? '...' : `${currentUsage} KW`}</Text>
              <Text style={[styles.metricSubtext, { color: colors.textSecondary }]}>
                Today's usage (since 00:00) • Updated: {formatLastUpdate()}
              </Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <View style={styles.metricHeader}>
                <MaterialIcons name="attach-money" size={24} color={colors.secondary} />
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Daily Cost</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.secondary }]}>{loading ? '...' : `${dailyCost} DH`}</Text>
              <Text style={[styles.metricSubtext, { color: colors.textSecondary }]}>Based on current usage</Text>
            </View>
          </View>

          <View style={styles.actionButtonsContainer}>

            <View style={styles.actionButtonRow}>
              <View style={[styles.actionButtonBox, { backgroundColor: colors.surface }]}>
                <Pressable 
                  style={[styles.actionButtonCircle, { backgroundColor: colors.primary }]}
                  onPress={() => handleAction('dashboard')}
                >
                  <MaterialIcons name="dashboard" size={24} color={colors.icon} />
                </Pressable>
                <Text style={[styles.actionButtonLabel, { color: colors.textSecondary }]}>Dashboards</Text>
              </View>

              <View style={[styles.actionButtonBox, { backgroundColor: colors.surface }]}>
                <Pressable
                  style={[styles.actionButtonCircle, { backgroundColor: colors.textSecondary }]}
                  onPress={() => router.push('/dropdown')}
                >
                  <MaterialIcons name="bar-chart" size={24} color={colors.icon} />
                </Pressable>
                <Text style={[styles.actionButtonLabel, { color: colors.textSecondary }]}>Charts</Text>

              </View>
            </View>
            <View style={styles.actionButtonRow}>

              <View style={[styles.actionButtonBox, { backgroundColor: colors.surface }]}>
                <Pressable 
                  style={[styles.actionButtonCircle, { backgroundColor: colors.secondary }]}
                  onPress={() => handleAction('qrscanner')}
                >
                  <Ionicons name="qr-code" size={24} color={colors.icon} />
                </Pressable>
                <Text style={[styles.actionButtonLabel, { color: colors.textSecondary }]}>Scan Device</Text>
              </View>
              <View style={[styles.actionButtonBox, { backgroundColor: colors.surface }]}>
                <Pressable 
                  style={[styles.actionButtonCircle, { backgroundColor: colors.accent }]}
                  onPress={() => handleAction('settings')}
                >
                  <Ionicons name="settings-outline" size={24} color={colors.icon} />
                </Pressable>
                <Text style={[styles.actionButtonLabel, { color: colors.textSecondary }]}>Settings</Text>
              </View>
            </View>

            <View style={styles.actionButtonRow}>

              <View style={[styles.actionButtonBox, { backgroundColor: colors.surface }]}>
                <Pressable 
                  style={[styles.actionButtonCircle, { backgroundColor: colors.primary }]}
                  onPress={() => handleAction('profile')}
                >
                  <FontAwesome5 name="user" size={24} color={colors.icon} />
                </Pressable>
                <Text style={[styles.actionButtonLabel, { color: colors.textSecondary }]}>Profile</Text>
              </View>
            </View>

            
          </View>

          <View style={styles.insightsContainer}>
            <Text style={[styles.insightsTitle, { color: colors.text }]}>Energy Insights</Text>
            <View style={[styles.insightCard, { backgroundColor: colors.surface }]}>
              <View style={styles.insightItem}>
                <MaterialIcons name="schedule" size={20} color={colors.primary} />
                <Text style={[styles.insightText, { color: colors.text }]}>Peak usage time: 16:00 - 18:00</Text>
              </View>
              <View style={styles.insightItem}>
                <MaterialIcons name="solar-power" size={20} color={colors.secondary} />
                <Text style={[styles.insightText, { color: colors.text }]}>Most efficient appliance: Solar Panel</Text>
              </View>
              <View style={styles.insightItem}>
                <MaterialIcons name="savings" size={20} color={colors.accent} />
                <Text style={[styles.insightText, { color: colors.text }]}>Cost savings this month: 24.50 Mad</Text>
              </View>
            </View>
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
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d3436',
    fontFamily: 'Poppins-Bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#636e72',
    marginTop: 4,
  },
  date: {
    fontSize: 14,
    marginTop: 4,
  },
  metricsContainer: {
    flexDirection: 'row',
    padding: 16,
    justifyContent: 'space-between',
  },
  metricCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 14,
    color: '#636e72',
    marginLeft: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#87BCDE',
    marginTop: 4,
  },
  metricSubtext: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 4,
  },
  insightsContainer: {
    padding: 16,
    marginBottom: 20,
  },
  insightsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3436',
    marginBottom: 12,
  },
  insightCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  insightText: {
    fontSize: 14,
    color: '#2d3436',
    marginLeft: 12,
    flex: 1,
  },
  actionButtonsContainer: {
    padding: 16,
    marginBottom: 20,
  },
  actionButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  actionButtonBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    width: '45%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#87BCDE',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonLabel: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 8,
    textAlign: 'center',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dashboardSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  dashboardCard: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dashboardTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  statsSection: {
    padding: 20,
    paddingTop: 0,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  statCard: {
    width: '48%',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  actionButton: {
    width: '45%',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#87BCDE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default HomeScreen; 