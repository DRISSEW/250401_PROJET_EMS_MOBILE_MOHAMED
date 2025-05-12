import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, SafeAreaView, Pressable, Alert, Dimensions, useWindowDimensions } from 'react-native';
import { MaterialIcons, Ionicons, FontAwesome5, FontAwesome6, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useApiKey } from '../context/ApiKeyContext';
import { useUser } from '../context/UserContext';
import AnimatedBottomBar from '../components/AnimatedBottomBar';
import { BarChart } from 'react-native-gifted-charts';
import { fetchFeeds, fetchFeedData, fetchDailyConsumptionData, clearProfileCache } from '../services/api';

const API_URL = 'http://electricwave.ma/energymonitoring/feed/list.json';

interface ConsumptionDataPoint {
  value: number;
  dataPointText: string;
  label: string;
  date: string;
}

interface ChartDataPoint {
  value: number;
  label: string;
  dataPointText: string;
  date: string;
}

const CHUNK_SIZE = 10; // Process 10 data points at a time

export const HomeScreen = () => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [isLandscape, setIsLandscape] = useState(windowWidth > windowHeight);
  
  // Update orientation state when dimensions change
  useEffect(() => {
    setIsLandscape(windowWidth > windowHeight);
  }, [windowWidth, windowHeight]);

  // Calculate responsive dimensions
  const CHART_HEIGHT = isLandscape ? windowHeight * 0.6 : windowHeight * 0.3;
  const CHART_WIDTH = windowWidth - 32; // 16px padding on each side

  const [currentTime, setCurrentTime] = useState(new Date());
  const { username } = useUser();
  
  const router = useRouter();
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const { apiKey } = useApiKey();
  const [energyValue, setEnergyValue] = useState<number>(0);
  const [waterValue, setWaterValue] = useState<number>(0);
  const [yesterdayEnergyValue, setYesterdayEnergyValue] = useState<number>(0);
  const [dailyConsumption, setDailyConsumption] = useState<number>(0);
  const [dailyWaterConsumption, setDailyWaterConsumption] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Add temperature state
  const [temperature, setTemperature] = useState<number | null>(null);
  const [temperatureUnit, setTemperatureUnit] = useState<string>('°C');
  const [temperatureFeedName, setTemperatureFeedName] = useState<string>('');
  const [temperatures, setTemperatures] = useState<{name: string, value: number}[]>([]);


  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const [liveUpdateInterval] = useState<number>(5); // seconds
  const [lastEnergyValue, setLastEnergyValue] = useState<number>(0);
  const [midnightEnergyValue, setMidnightEnergyValue] = useState<number>(0);
  const [midnightWaterValue, setMidnightWaterValue] = useState<number>(0);
  const [isLiveUpdating, setIsLiveUpdating] = useState<boolean>(false);
  const [currentTabIndex, setCurrentTabIndex] = useState(0);

  const [energyFeedId, setEnergyFeedId] = useState<string | null>(null);
  const [monthlyConsumptionData, setMonthlyConsumptionData] = useState<{ consumption: number, cost: number, label: string, date: string }[]>([]);

  const [waterFeedId, setWaterFeedId] = useState<string | null>(null);
  const [monthlyWaterConsumptionData, setMonthlyWaterConsumptionData] = useState<{ consumption: number, cost: number, label: string, date: string }[]>([]);


  const handleTabPress = (index: number) => {
    setCurrentTabIndex(index);
    switch (index) {
      case 0:
        router.push('/home');
        break;
      case 1:
        router.push('/dashboards');
        break;
      case 2:
        router.push('/dropdown');
        break;
      case 3:
        router.push('/settings');
        break;
      case 4:
        router.push('/profile');
        break;
    }
  };

  const formatLargeNumber = (value: number): string => {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`; // Millions
    } else if (value >= 1_000) {
      return `${(value / 1_000).toFixed(2)}K`; // Thousands
    }
    return value.toFixed(2); // Default to two decimal places
  };

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
        const energyFeed = data.find((feed: any) => feed.name === 'ENERGY' || feed.name === 'KWHT' || feed.name === 'kWT');
        const waterFeed = data.find((feed: any) => feed.name === 'VOLUME');
        
        // Find temperature feed using array includes method
        const temperatureFeeds = ['TEMP1', 'TEMP2', 'TEMP_26', 'Temp1', 'temp'];
        const foundTemperatureFeeds = data.filter((feed: any) => 
          temperatureFeeds.includes(feed.name)
        );
        
        // Process all found temperature feeds
        if (foundTemperatureFeeds.length > 0) {
          const tempValues = foundTemperatureFeeds.map((feed: { name: any; value: any; }) => ({
            name: feed.name,
            value: Number(feed.value)
          }));
          setTemperatures(tempValues);
          console.log('Temperature values:', tempValues);
        }

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

        if (waterFeed) {
          const currentWater = Number(waterFeed.value);
          setWaterValue(currentWater);
        
          const now = new Date();
          const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const nowMs = now.getTime();
        
          try {
            const waterResponse = await fetch(
              `http://electricwave.ma/energymonitoring/feed/data.json?id=${waterFeed.id}&start=${todayMidnight}&end=${nowMs}&interval=60&apikey=${apiKey}`
            );
        
            if (waterResponse.ok) {
              const waterData = await waterResponse.json();
              if (waterData && waterData.length > 0) {
                const midnightWaterValue = Number(waterData[0][1]);
                setMidnightWaterValue(midnightWaterValue);
                const todayWater = currentWater - midnightWaterValue;
                setDailyWaterConsumption(todayWater);
              }
            }
          } catch (err) {
            console.error('Error fetching water data:', err);
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
        const energyFeed = data.find((feed: any) => feed.name === 'ENERGY' || feed.name === 'KWHT' || feed.name === 'kWT');
        // Find temperature feed using array includes method
        const temperatureFeeds = ['TEMP1', 'TEMP2', 'TEMP_26', 'Temp1', 'temp'];
        // Find all temperature feeds
        const foundTemperatureFeeds = data.filter((feed: any) => 
          temperatureFeeds.includes(feed.name)
        );
        
        // Process all found temperature feeds
        if (foundTemperatureFeeds.length > 0) {
          const tempValues = foundTemperatureFeeds.map((feed: { name: any; value: any; }) => ({
            name: feed.name,
            value: Number(feed.value)
          }));
          setTemperatures(tempValues);
        }
        
        
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

  useEffect(() => {
    const fetchMonthlyWaterConsumptionData = async () => {
      if (!apiKey) {
        console.log('No API key available');
        return;
      }
      
      try {
        // First get the feed ID if we don't have it
        if (!waterFeedId) {
          console.log('Fetching feeds to get water feed ID...');
          const feeds = await fetchFeeds(apiKey);
          console.log('Feeds received:', feeds);
          const waterFeed = feeds.find((feed: any) => feed.name === 'VOLUME');
          if (waterFeed) {
            console.log('Found water feed:', waterFeed);
            setWaterFeedId(waterFeed.id);
            return; // Wait for the next effect run with the new feed ID
          } else {
            console.log('No water feed found');
            return;
          }
        }
        
        // Ensure we have a valid feed ID
        if (typeof waterFeedId !== 'string') {
          console.log('Invalid water feed ID:', waterFeedId);
          return;
        }
  
        console.log('Fetching daily water consumption data...');
        const rawData = await fetchDailyConsumptionData(waterFeedId, apiKey, username);
        
        // Group data by month and accumulate values
        const monthlyData = new Map<string, { consumption: number, cost: number }>();
        
        rawData.forEach((point: ConsumptionDataPoint) => {
          const date = new Date(point.date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          
          if (!monthlyData.has(monthKey)) {
            monthlyData.set(monthKey, { consumption: 0, cost: 0 });
          }
          const currentData = monthlyData.get(monthKey)!;
          
          // Convert from liters to cubic meters (divide by 1000)
          const volumeInCubicMeters = point.value / 1000;
          
          // Calculate cost based on the progressive rate
          const rate = getWaterRatePerM3(volumeInCubicMeters);
          const cost = volumeInCubicMeters * rate;
          
          currentData.consumption += volumeInCubicMeters;
          currentData.cost += cost;
          
          monthlyData.set(monthKey, currentData);
        });
  
        // Convert Map to array and sort by date
        const processedData = Array.from(monthlyData.entries())
          .map(([key, data]) => {
            const [year, month] = key.split('-');
            const date = new Date(parseInt(year), parseInt(month) - 1);
            return {
              consumption: data.consumption,
              cost: data.cost,
              label: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
              date: date.toISOString(),
            };
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
        setMonthlyWaterConsumptionData(processedData);
  
      } catch (err) {
        console.error('Error fetching monthly water consumption data:', err);
      }
    };
  
    fetchMonthlyWaterConsumptionData();
    const interval = setInterval(fetchMonthlyWaterConsumptionData, 3600000); // Update every hour
    return () => clearInterval(interval);
  }, [apiKey, waterFeedId, username]);
  

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

  

  // Calculate current usage (daily consumption divided by 1000)
  const currentUsage = (dailyConsumption ).toFixed(2);

  const getElectricityRatePerKWh = (monthlyKWh:any) => {
    if (monthlyKWh <= 100) return 0.901;
    if (monthlyKWh <= 200) return 1.048;
    if (monthlyKWh <= 500) return 1.445;
    return 1.594;
  };
  
  const m3 = dailyWaterConsumption / 1000;

  const getWaterRatePerM3 = (m3: number) => {
    if (m3 <= 0.006) return 2.54;
    if (m3 <= 0.012) return 7.91;
    if (m3 <= 0.020) return 7.91;
    if (m3 <= 0.035) return 11.75;
    return 11.80;
  };

  const monthlyKWh = dailyConsumption ; // Assuming 30 days in a month  
  const kwhrate = getElectricityRatePerKWh(monthlyKWh);
  
  const rate = getWaterRatePerM3(m3);
  
  // Calculate daily cost (daily consumption multiplied by kwhrate)
  const dailyCost = (Number(currentUsage) * kwhrate).toFixed(2);
  const dailyWaterCost = (m3 * rate).toFixed(2);

  // Format the last update time
  const formatLastUpdate = () => {
    return lastUpdateTime.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Add this function for LTTB downsampling
  const lttbDownsample = (data: ConsumptionDataPoint[], threshold: number) => {
    if (data.length <= threshold) return data;
    
    const result = [];
    let dataLength = data.length;
    let sampledIndex = 0;
    
    // Always add the first point
    result.push(data[0]);
    
    for (let i = 2; i < dataLength - 2; i += 2) {
      // Calculate the triangle areas and find the point that creates the largest triangle
      let maxArea = -1;
      let maxAreaIndex = i;
      
      for (let j = i - 1; j < i + 2; j++) {
        const area = Math.abs(
          (data[sampledIndex].value - data[j].value) * (data[j + 1].value - data[sampledIndex].value) -
          (data[sampledIndex].value - data[j + 1].value) * (data[j].value - data[sampledIndex].value)
        );
        
        if (area > maxArea) {
          maxArea = area;
          maxAreaIndex = j;
        }
      }
      
      result.push(data[maxAreaIndex]);
      sampledIndex = i;
    }
    
    // Always add the last point
    result.push(data[dataLength - 1]);
    
    return result;
  };

  // Modify the useEffect for monthly consumption data
  useEffect(() => {
    const fetchMonthlyConsumptionData = async () => {
      if (!apiKey) {
        console.log('No API key available');
        return;
      }
      
      try {
        // First get the feed ID if we don't have it
        if (!energyFeedId) {
          console.log('Fetching feeds to get energy feed ID...');
          const feeds = await fetchFeeds(apiKey);
          console.log('Feeds received:', feeds);
          const energyFeed = feeds.find((feed: any) => feed.name === 'ENERGY' || feed.name === 'KWHT' || feed.name === 'kWT');
          const waterFeed = feeds.find((feed: any) => feed.name === 'VOLUME');
          if (energyFeed) {
            console.log('Found energy feed:', energyFeed);
            setEnergyFeedId(energyFeed.id);
            return; // Wait for the next effect run with the new feed ID
          } else {
            console.log('No energy feed found');
            return;
          }
        }
        

        // Ensure we have a valid feed ID
        if (typeof energyFeedId !== 'string') {
          console.log('Invalid feed ID:', energyFeedId);
          return;
        }

        console.log('Fetching daily consumption data...');
        const rawData = await fetchDailyConsumptionData(energyFeedId, apiKey, username);
        
        // Group data by month and accumulate values
        const monthlyData = new Map<string, { consumption: number, cost: number }>();
        
        rawData.forEach((point: ConsumptionDataPoint) => {
          const date = new Date(point.date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          
          if (!monthlyData.has(monthKey)) {
            monthlyData.set(monthKey, { consumption: 0, cost: 0 });
          }
          const currentData = monthlyData.get(monthKey)!;
          currentData.consumption += point.value;
          currentData.cost += point.value * 1.15; // Calculate cost with rate 1.15
          monthlyData.set(monthKey, currentData);
        });

        // Convert Map to array and sort by date
        const processedData = Array.from(monthlyData.entries())
          .map(([key, data]) => {
            const [year, month] = key.split('-');
            const date = new Date(parseInt(year), parseInt(month) - 1);
            return {
              consumption: data.consumption,
              cost: data.cost,
              label: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
              date: date.toISOString(),
            };
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        setMonthlyConsumptionData(processedData);

      } catch (err) {
        console.error('Error fetching monthly consumption data:', err);
      }
    };

    fetchMonthlyConsumptionData();
    const interval = setInterval(fetchMonthlyConsumptionData, 3600000); // Update every hour
    return () => clearInterval(interval);
  }, [apiKey, energyFeedId, username]);

  

  // Add effect to clear cache when username changes
  useEffect(() => {
    clearProfileCache(username);
  }, [username]);

  // Modify the renderMonthlyConsumptionGraph function
  const renderMonthlyConsumptionGraph = () => {
    if (!monthlyConsumptionData || monthlyConsumptionData.length === 0) {
      return (
        <View style={[styles.graphContainer, { backgroundColor: colors.surface }]}>
          <View style={[styles.graphHeader, isLandscape && styles.graphHeaderLandscape]}>
            <Text style={[styles.graphTitle, { color: colors.text }]}>Monthly Consumption & Cost</Text>
            <View style={styles.graphLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>Consumption</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.secondary }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>Cost</Text>
              </View>
            </View>
          </View>
          <View style={[styles.loadingContainer, { height: CHART_HEIGHT }]}>
            <Text style={{ color: colors.textSecondary }}>
              No data available
            </Text>
          </View>
        </View>
      );
    }

    // Calculate max values for better graph scaling
    const maxConsumption = Math.max(...monthlyConsumptionData.map(point => point.consumption || 0));
    const maxCost = Math.max(...monthlyConsumptionData.map(point => point.cost || 0));
    const yAxisMax = Math.ceil(Math.max(maxConsumption, maxCost));

    // Calculate label interval based on data length and orientation
    const totalPoints = monthlyConsumptionData.length;
    let labelInterval = 1;
    if (isLandscape) {
      if (totalPoints > 30) labelInterval = Math.ceil(totalPoints / 30);
    } else {
      if (totalPoints > 20) labelInterval = Math.ceil(totalPoints / 20);
      if (totalPoints > 50) labelInterval = Math.ceil(totalPoints / 15);
      if (totalPoints > 100) labelInterval = Math.ceil(totalPoints / 10);
    }

    // Format data for bar chart with alternating consumption and cost bars
    const chartData = monthlyConsumptionData.flatMap((point, index) => [
      {
        value: point.consumption || 0,
        frontColor: colors.primary,
        gradientColor: colors.primary,
        spacing: 6,
        label: index % labelInterval === 0 ? point.label : '',
        date: point.date,
        type: 'consumption'
      },
      {
        value: point.cost || 0,
        frontColor: colors.secondary,
        gradientColor: colors.secondary,
        spacing: isLandscape ? 40 : 20, // Add larger spacing after each pair
        label: '', // Empty label for cost bar to show only one date per month
        date: point.date,
        type: 'cost'
      }
    ]);

    // Calculate averages with null checks
    const averageConsumption = monthlyConsumptionData.reduce((sum, point) => sum + (point.consumption || 0), 0) / monthlyConsumptionData.length;
    const averageCost = monthlyConsumptionData.reduce((sum, point) => sum + (point.cost || 0), 0) / monthlyConsumptionData.length;

    return (
      <View style={[styles.graphContainer, { backgroundColor: colors.surface }]}>
        <View style={[styles.graphHeader, isLandscape && styles.graphHeaderLandscape]}>
          <Text style={[styles.graphTitle, { color: colors.text }]}>Monthly Consumption & Cost</Text>
        </View>
        <View style={{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"center",position:"relative"}}>
          <View style={styles.graphLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>Consumption</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.secondary }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>Cost</Text>
            </View>
          </View>
        </View>
        
        <View style={[styles.chartContainer, { height: CHART_HEIGHT }]}>
          <BarChart
            data={chartData}
            height={CHART_HEIGHT}
            width={isLandscape ? CHART_WIDTH * 0.8 : CHART_WIDTH * 0.75}
            spacing={isLandscape ? 40 : 20}
            initialSpacing={isLandscape ? 20 : 10}
            barWidth={isLandscape ? 15 : 10}
            barBorderRadius={4}
            showGradient
            yAxisThickness={1}
            xAxisType="dashed"
            xAxisColor={colors.border}
            yAxisTextStyle={{ color: colors.textSecondary }}
            xAxisLabelTextStyle={{ 
              color: colors.textSecondary, 
              fontSize: isLandscape ? 12 : 10,
              position: 'relative',
              transform: [{ rotate: isLandscape ? '0deg' : '-60deg' }],
              right: isLandscape ? 0 :5,
              left: isLandscape ? 0 : -35,
              bottom: isLandscape ? 0 :5,
              top: isLandscape ? 0 :-25,

            }}
            rotateLabel={!isLandscape}
            yAxisLabelWidth={isLandscape ? 50 : 40}
            yAxisLabelSuffix=" kWh"
            maxValue={yAxisMax}
            noOfSections={isLandscape ? 8 : 5}
            rulesType="solid"
            rulesColor={colors.border}
            rulesThickness={1}
            hideRules={false}
            hideYAxisText={false}
            showVerticalLines
            verticalLinesColor={colors.border}
            verticalLinesSpacing={isLandscape ? 60 : 40}
            isAnimated
            animationDuration={1000}
            onPress={(item: any) => {
              Alert.alert(
                'Bar Details',
                `Date: ${item.label || 'N/A'}\nValue: ${(item.value || 0).toFixed(2)} ${item.type === 'consumption' ? 'kWh' : 'DH'}`
              );
            }}
            barMarginBottom={20}
            labelWidth={isLandscape ? 60 : 40}
            topLabelTextStyle={{
              color: colors.text,
              fontSize: isLandscape ? 12 : 10,
              fontWeight: '500'
            }}
            hideOrigin={true}
            showFractionalValues={false}
            formatYLabel={(label: string) => `${Math.round(Number(label))}`}
            showValuesOnTopOfBars={false}
            showVerticalLabels={true}
            showHorizontalLabels={true}
            horizontalRulesStyle={{
              strokeDasharray: '2,2',
              strokeWidth: 1,
              stroke: colors.border
            }}
          />
        </View>

        <View style={[styles.graphStats, isLandscape && styles.graphStatsLandscape]}>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Avg Consumption</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {formatLargeNumber(Number(averageConsumption.toFixed(2)))} kWh
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Avg Cost</Text>
            <Text style={[styles.statValue, { color: colors.secondary }]}>
              {formatLargeNumber(Number(averageCost.toFixed(2)))} DH
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderMonthlyWaterConsumptionGraph = () => {
    if (!monthlyWaterConsumptionData || monthlyWaterConsumptionData.length === 0) {
      return (
        <View style={[styles.graphContainer, { backgroundColor: colors.surface }]}>
          <View style={[styles.graphHeader, isLandscape && styles.graphHeaderLandscape]}>
            <Text style={[styles.graphTitle, { color: colors.text }]}>Monthly Water Consumption & Cost</Text>
            <View style={styles.graphLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#4ECDC4' }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>Consumption</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#6495ED' }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>Cost</Text>
              </View>
            </View>
          </View>
          <View style={[styles.loadingContainer, { height: CHART_HEIGHT }]}>
            <Text style={{ color: colors.textSecondary }}>
              No data available
            </Text>
          </View>
        </View>
      );
    }
  
    // Calculate min and max values for better graph scaling
    const allValues = monthlyWaterConsumptionData.flatMap(point => [point.consumption || 0, point.cost || 0]);
    const maxValue = Math.max(...allValues);
    
    // Calculate y-axis max value based on ranges
    let yAxisMax = 50;
    if (maxValue > 50) yAxisMax = 100;
    if (maxValue > 100) yAxisMax = 500;
    if (maxValue > 500) yAxisMax = 1000;
    if (maxValue > 1000) yAxisMax = 2000;
    if (maxValue > 2000) yAxisMax = 5000;
    if (maxValue > 5000) yAxisMax = 10000;
    
    // Calculate number of sections based on the range
    let noOfSections;
    if (yAxisMax <= 50) noOfSections = 5;
    else if (yAxisMax <= 100) noOfSections = 5;
    else if (yAxisMax <= 500) noOfSections = 5;
    else if (yAxisMax <= 1000) noOfSections = 5;
    else if (yAxisMax <= 2000) noOfSections = 4;
    else if (yAxisMax <= 5000) noOfSections = 5;
    else noOfSections = 5;

    // Calculate label interval based on data length and orientation
    const totalPoints = monthlyWaterConsumptionData.length;
    let labelInterval = 1;
    if (isLandscape) {
      if (totalPoints > 30) labelInterval = Math.ceil(totalPoints / 30);
    } else {
      if (totalPoints > 20) labelInterval = Math.ceil(totalPoints / 20);
      if (totalPoints > 50) labelInterval = Math.ceil(totalPoints / 15);
      if (totalPoints > 100) labelInterval = Math.ceil(totalPoints / 10);
    }
  
    // Format data for bar chart with alternating consumption and cost bars
    const chartData = monthlyWaterConsumptionData.flatMap((point, index) => [
      {
        value: point.consumption || 0,
        frontColor: '#4ECDC4', // Teal color for water consumption
        gradientColor: '#4ECDC4',
        spacing: 6,
        label: index % labelInterval === 0 ? point.label : '',
        date: point.date,
        type: 'consumption'
      },
      {
        value: point.cost || 0,
        frontColor: '#6495ED', // Cornflower blue for water cost
        gradientColor: '#6495ED',
        spacing: isLandscape ? 40 : 20, // Add larger spacing after each pair
        label: '', // Empty label for cost bar to show only one date per month
        date: point.date,
        type: 'cost'
      }
    ]);
  
    // Calculate averages with null checks
    const averageConsumption = monthlyWaterConsumptionData.reduce((sum, point) => sum + (point.consumption || 0), 0) / monthlyWaterConsumptionData.length;
    const averageCost = monthlyWaterConsumptionData.reduce((sum, point) => sum + (point.cost || 0), 0) / monthlyWaterConsumptionData.length;
  
    return (
      <View style={[styles.graphContainer, { backgroundColor: colors.surface }]}>
        <View style={[styles.graphHeader, isLandscape && styles.graphHeaderLandscape]}>
          <Text style={[styles.graphTitle, { color: colors.text }]}>Monthly Water Consumption & Cost</Text>
        </View>
        <View style={{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"center",position:"relative"}}>
          <View style={styles.graphLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4ECDC4' }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>Consumption</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#6495ED' }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>Cost</Text>
            </View>
          </View>
        </View>
        
        <View style={[styles.chartContainer, { height: CHART_HEIGHT }]}>
          <BarChart
            data={chartData}
            height={CHART_HEIGHT}
            width={isLandscape ? CHART_WIDTH * 0.8 : CHART_WIDTH * 0.75}
            spacing={isLandscape ? 40 : 20}
            initialSpacing={isLandscape ? 20 : 10}
            barWidth={isLandscape ? 15 : 10}
            barBorderRadius={4}
            showGradient
            yAxisThickness={1}
            xAxisType="dashed"
            xAxisColor={colors.border}
            yAxisTextStyle={{ color: colors.textSecondary }}
            xAxisLabelTextStyle={{ 
              color: colors.textSecondary, 
              fontSize: isLandscape ? 12 : 10,
              position: 'relative',
              transform: [{ rotate: isLandscape ? '0deg' : '-60deg' }],
              right: isLandscape ? 0 : 5,
              left: isLandscape ? 0 : -35,
              bottom: isLandscape ? 0 : 5,
              top: isLandscape ? 0 : -25,
            }}
            rotateLabel={!isLandscape}
            yAxisLabelWidth={isLandscape ? 50 : 40}
            yAxisLabelSuffix=" m³"
            maxValue={yAxisMax}
            noOfSections={noOfSections}
            rulesType="solid"
            rulesColor={colors.border}
            rulesThickness={1}
            hideRules={false}
            hideYAxisText={false}
            showVerticalLines
            verticalLinesColor={colors.border}
            verticalLinesSpacing={isLandscape ? 60 : 40}
            isAnimated
            animationDuration={1000}
            onPress={(item: any) => {
              Alert.alert(
                'Bar Details',
                `Date: ${item.label || 'N/A'}\nValue: ${(item.value || 0).toFixed(2)} ${item.type === 'consumption' ? 'm³' : 'DH'}`
              );
            }}
            barMarginBottom={20}
            labelWidth={isLandscape ? 60 : 40}
            topLabelTextStyle={{
              color: colors.text,
              fontSize: isLandscape ? 12 : 10,
              fontWeight: '500'
            }}
            hideOrigin={true}
            showFractionalValues={false}
            formatYLabel={(label: string) => `${Math.round(Number(label))}`}
            horizontalRulesStyle={{
              strokeDasharray: '2,2',
              strokeWidth: 1,
              stroke: colors.border
            }}
          />
        </View>
  
        <View style={[styles.graphStats, isLandscape && styles.graphStatsLandscape]}>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Avg Consumption</Text>
            <Text style={[styles.statValue, { color: '#4ECDC4' }]}>
              {averageConsumption.toFixed(2)} m³
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Avg Cost</Text>
            <Text style={[styles.statValue, { color: '#6495ED' }]}>
              {averageCost.toFixed(2)} DH
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.content, { backgroundColor: colors.background, paddingBottom: 60 }]}>
        <ScrollView>
          <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"flex-start",position:"relative"}}>
              
              <Text style={{fontSize: 24,fontWeight: 'bold',color: colors.text,position:"relative"}}>Hi, {username}</Text>
            </View>
            <Text style={[styles.date, { color: colors.textSecondary }]}>{formatDate(currentTime)}</Text>
          </View>

          {/* Temperature Display Cards */}
          
          {temperatures.length > 0 && (
            <View style={[ { flexDirection: 'row' , alignItems: 'center', justifyContent: 'space-around',marginTop:12 }]}>
              {temperatures.map((temp, index) => (
                <View key={index} style={[ { marginBottom: 12 }]}>
                  <View style={styles.temperatureHeader}>
                    <MaterialCommunityIcons 
                      name="thermometer" 
                      size={28} 
                      color={temp.value > 25 ? '#FF6B6B' : '#4ECDC4'} 
                    />
                    <Text style={[styles.temperatureLabel, { color: colors.textSecondary }]}>
                      {temp.name}
                    </Text>
                  </View>
                  <Text style={[styles.temperatureValue, { 
                    color: temp.value > 30 ? '#FF6B6B' : 
                           temp.value > 25 ? '#FFA64D' : 
                           temp.value > 15 ? '#4ECDC4' : '#6495ED' 
                  }]}>
                    {temp.value.toFixed(1)}{temperatureUnit}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.metricsContainer}>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <View style={styles.metricHeader}>
                <MaterialCommunityIcons name="lightning-bolt" size={24} color={colors.primary} />
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Current Usage</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.primary }]}>{loading ? '...' : `${currentUsage} Kwh`}</Text>
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

          
          <View style={styles.metricsContainer}>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <View style={styles.metricHeader}>
                <MaterialCommunityIcons name="water" size={24} color={colors.primary} />
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Live Usage</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.primary }]}>{loading ? '...' : `${dailyWaterConsumption.toFixed(2)} L`}</Text>
              <Text style={[styles.metricSubtext, { color: colors.textSecondary }]}>
                Today's usage (since 00:00) • Updated: {formatLastUpdate()}
              </Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <View style={styles.metricHeader}>
                <MaterialIcons name="attach-money" size={24} color={colors.secondary} />
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Live Cost</Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.secondary }]}>{loading ? '...' : `${dailyWaterCost} DH`}</Text>
              <Text style={[styles.metricSubtext, { color: colors.textSecondary }]}>Based on current usage</Text>
            </View>
          </View>

          <View style={{flex: 1, padding: 16}}>
            {renderMonthlyConsumptionGraph()}
          </View>

          

          <View style={{flex: 1, padding: 16}}>
            {renderMonthlyWaterConsumptionGraph()}
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
      <AnimatedBottomBar
        currentIndex={currentTabIndex}
        onTabPress={handleTabPress}
      />
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  temperatureCard: {
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  temperatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  temperatureLabel: {
    fontSize: 14,
    marginLeft: 8,
  },
  temperatureValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  temperatureSubtext: {
    fontSize: 11,
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
  graphContainer: {
    padding: 16,
    marginBottom: 20,
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
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  graphHeaderLandscape: {
    marginBottom: 24,
  },
  graphTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  graphLegend: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginRight: 16, 
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendText: {
    fontSize: 12,
  },
  chartContainer: {
    marginVertical: 8,
  },
  tooltipContainer: {
    height: 90,
    justifyContent: 'center',
    marginTop: -30,
    marginLeft: -40,
  },
  tooltipContent: {
    padding: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tooltipDate: {
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  tooltipValue: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tooltipDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 4,
  },
  tooltipAverage: {
    fontSize: 10,
    textAlign: 'center',
  },
  graphStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
  graphStatsLandscape: {
    marginTop: 24,
    paddingTop: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  barLabel: {
    fontSize: 10,
    marginTop: 4,
  },
});

export default HomeScreen; 