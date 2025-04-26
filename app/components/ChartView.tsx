import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Dimensions, AppState, AppStateStatus, Platform, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { FontAwesome } from '@expo/vector-icons';
import { ChartViewProps } from '../types';
import { CHART_CONFIG } from '../constants';
import { fetchFeedData } from '../services/api';
import { useApiKey } from '../context/ApiKeyContext';
import { useTheme } from '../context/ThemeContext';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { PinchGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';

// Define the new TIME_RANGES constant with intervals
const TIME_RANGES = {
  DAY: { label: 'Day', value: 24 * 60 * 60, interval: 120 }, // 24h with 30min intervals
  WEEK: { label: 'Week', value: 7 * 24 * 60 * 60, interval: 900 }, // 7 days with 6h intervals
  MONTH: { label: 'Month', value: 30 * 24 * 60 * 60, interval: 3600 }, // 30 days with 1 day intervals
  YEAR: { label: 'Year', value: 365 * 24 * 60 * 60, interval: 43200 }, // 365 days with 1 week intervals
};

// Convert TIME_RANGES object to array format for component use
const TIME_RANGES_ARRAY = [
  { hours: TIME_RANGES.DAY.value / 3600, label: TIME_RANGES.DAY.label, icon: 'clock-o' as const, interval: TIME_RANGES.DAY.interval },
  { hours: TIME_RANGES.WEEK.value / 3600, label: TIME_RANGES.WEEK.label, icon: 'calendar-o' as const, interval: TIME_RANGES.WEEK.interval },
  { hours: TIME_RANGES.MONTH.value / 3600, label: TIME_RANGES.MONTH.label, icon: 'calendar-o' as const, interval: TIME_RANGES.MONTH.interval },
  { hours: TIME_RANGES.YEAR.value / 3600, label: TIME_RANGES.YEAR.label, icon: 'calendar-o' as const, interval: TIME_RANGES.YEAR.interval },
];

const CHART_HEIGHT = 220;

const useChartWidth = () => {
  // Initialize with current dimensions
  const [chartWidth, setChartWidth] = useState(() => calculateChartWidth());
  
  // Efficient calculation function
  function calculateChartWidth() {
    const { width, height } = Dimensions.get('window');
    const isLandscape = width > height;
    
    // Platform detection (simplified for performance)
    const isIpad = Platform.OS === 'ios' && Platform.isPad;
    const isTablet = Platform.OS === 'android' && width >= 768;
    
    // Optimized margin calculation (using object lookup instead of conditionals)
    const marginMap = {
      ipadLandscape: 0.08,
      ipadPortrait: 0.1,
      tabletLandscape: 0.08,
      tabletPortrait: 0.1,
      iosLandscape: 0.08,
      iosPortrait: 0.3,
      androidLandscape: 0.08,
      androidPortrait: 0.3
    };
    
    // Determine the correct margin key
    let marginKey;
    if (isIpad) {
      marginKey = isLandscape ? 'ipadLandscape' : 'ipadPortrait';
    } else if (isTablet) {
      marginKey = isLandscape ? 'tabletLandscape' : 'tabletPortrait';
    } else if (Platform.OS === 'ios') {
      marginKey = isLandscape ? 'iosLandscape' : 'iosPortrait';
    } else {
      marginKey = isLandscape ? 'androidLandscape' : 'androidPortrait';
    }
    
    // Apply margin and return width
    return width - (width * marginMap[marginKey as keyof typeof marginMap]);
  }
  
  // Only add event listener once on mount
  useEffect(() => {
    // Handler function - memoize to prevent recreation
    const handleDimensionChange = () => {
      setChartWidth(calculateChartWidth());
    };
    
    // Add event listener
    const subscription = Dimensions.addEventListener('change', handleDimensionChange);
    
    // Clean up on unmount
    return () => {
      subscription.remove();
    };
  }, []);
  
  // Return current width for component use
  return chartWidth;
};

const CACHE_EXPIRATION = 30 * 60 * 1000;

export const ChartView: React.FC<ChartViewProps> = ({ feed, onBack }) => {
  const [selectedRange, setSelectedRange] = useState(TIME_RANGES_ARRAY[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{ labels: string[]; values: number[] } | null>(null);
  const [stats, setStats] = useState<{ mean: number; min: number; max: number; total: number } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; value: number; label: string } | null>(null);
  const { apiKey } = useApiKey();
  const { colors } = useTheme();
  const CHART_WIDTH = useChartWidth();
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const lastScale = useRef(1);
  const baseZoomLevel = useRef(1);

  // Data cache with timestamps for expiration check
  const [dataCache, setDataCache] = useState<Record<string, { 
    data: any, 
    timestamp: number,
    range: number 
  }>>({});
  
  const scrollViewRef = useRef<ScrollView>(null);
  const appStateRef = useRef(AppState.currentState);
  const dataProcessingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Monitor app state for cleanup
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      if (dataProcessingTimeoutRef.current) {
        clearTimeout(dataProcessingTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appStateRef.current.match(/active/) && nextAppState.match(/inactive|background/)) {
      // App going to background - cancel pending operations
      if (dataProcessingTimeoutRef.current) {
        clearTimeout(dataProcessingTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
    appStateRef.current = nextAppState;
  };

  // Clean old cache entries periodically
  useEffect(() => {
    const cleanupCache = () => {
      const now = Date.now();
      const updatedCache = { ...dataCache };
      let modified = false;

      Object.keys(updatedCache).forEach(key => {
        if (now - updatedCache[key].timestamp > CACHE_EXPIRATION) {
          delete updatedCache[key];
          modified = true;
        }
      });

      if (modified) {
        setDataCache(updatedCache);
      }
    };

    // Clean cache when component mounts and when selectedRange changes
    cleanupCache();
    
    // Also set up interval for periodic cleanup
    const intervalId = setInterval(cleanupCache, CACHE_EXPIRATION / 2);
    return () => clearInterval(intervalId);
  }, [dataCache]);

  // Enhanced downsampling based on Emoncms approach - preserve visually significant points
  const downsampleData = useCallback((data: any[], targetPoints = 1000) => {
    if (!data || data.length <= targetPoints) return data;
    
    // Use LTTB (Largest-Triangle-Three-Buckets) algorithm for downsampling
    // This preserves visual characteristics better than simple min-max
    const lttbDownsample = (data: any[], threshold: number) => {
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
            (data[sampledIndex] - data[j]) * (data[j + 1] - data[sampledIndex + 1]) -
            (data[sampledIndex] - data[j + 1]) * (data[j] - data[sampledIndex + 1])
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
    
    // Adjust downsampling based on time range
    const factor = selectedRange.hours > 24 ? 2 : 1;
    const adjustedTargetPoints = Math.floor(targetPoints / factor);
    
    return lttbDownsample(data, adjustedTargetPoints);
  }, [selectedRange.hours]);

  // Process data in background using setTimeout to avoid blocking UI
  const processDataInBackground = useCallback((rawData: any) => {
    return new Promise((resolve) => {
      if (dataProcessingTimeoutRef.current) {
        clearTimeout(dataProcessingTimeoutRef.current);
      }
      
      dataProcessingTimeoutRef.current = setTimeout(() => {
        // Calculate appropriate number of data points based on screen width
        const pointsPerPixel = 15; // Reduced for better performance while still maintaining detail
        const targetPoints = Math.floor(CHART_WIDTH * pointsPerPixel);
        
        console.log(`Processing data for time range: ${selectedRange.hours} hours`);
        console.log('Raw data received:', rawData);
        
        // Ensure we have valid data before processing
        if (!rawData || !rawData.chartData || !rawData.chartData.labels || !rawData.chartData.values) {
          console.warn('Invalid data structure received:', rawData);
          resolve({
            chartData: { labels: [], values: [] },
            stats: { mean: 0, min: 0, max: 0, total: 0 }
          });
          return;
        }
        
        // Filter out any NaN values before downsampling
        const validData = {
          labels: rawData.chartData.labels.filter((_: string, index: number) => 
            !isNaN(parseFloat(rawData.chartData.values[index]))
          ),
          values: rawData.chartData.values.filter((value: string | number) => !isNaN(parseFloat(String(value))))
        };
        
        console.log(`Valid data points: ${validData.labels.length} out of ${rawData.chartData.labels.length}`);
        
        // Ensure we have matching arrays
        const minLength = Math.min(validData.labels.length, validData.values.length);
        
        // Format timestamps like Emoncms does
        const formattedLabels = validData.labels.slice(0, minLength).map((label: string) => {
          // For time-only values (HH:mm format), return as is
          if (/^\d{2}:\d{2}$/.test(label)) {
            return label;
          }
          
          try {
            // Try to parse the date properly
            let date;
            
            // Check if it's a timestamp number
            if (!isNaN(Number(label))) {
              date = new Date(Number(label));
            } else {
              // Try to parse string date
              date = new Date(label);
            }
            
            // Validate the date object
            if (isNaN(date.getTime())) {
              console.warn('Invalid date detected:', label);
              return label; // Return original label if date is invalid
            }
            
            // Format based on selected time range
            if (selectedRange.hours <= 24) {
              // For 24 hours or less: show time only (HH:mm)
              return date.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              });
            } else if (selectedRange.hours <= 24 * 7) {
              // For 7 days or less: show day/month and time
              const day = date.getDate().toString().padStart(2, '0');
              const month = (date.getMonth() + 1).toString().padStart(2, '0');
              const time = date.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              });
              return `${day}/${month} ${time}`;
            } else {
              // For longer periods: show day/month
              const day = date.getDate().toString().padStart(2, '0');
              const month = (date.getMonth() + 1).toString().padStart(2, '0');
              return `${day}/${month}`;
            }
          } catch (err) {
            console.warn('Error formatting date label:', err);
            return label; // Return original label if there's an error
          }
        });
        
        const processedData = {
          chartData: {
            labels: downsampleData(formattedLabels, targetPoints),
            values: downsampleData(validData.values.slice(0, minLength), targetPoints)
          },
          stats: rawData.stats
        };
        
        // Validate stats to prevent NaN values
        if (processedData.stats) {
          const { mean, min, max, total } = processedData.stats;
          processedData.stats = {
            mean: isNaN(mean) ? 0 : mean,
            min: isNaN(min) ? 0 : min,
            max: isNaN(max) ? 0 : max,
            total: isNaN(total) ? 0 : total
          };
          console.log('Processed stats:', processedData.stats);
        } else {
          console.warn('No stats available in processed data');
          processedData.stats = { mean: 0, min: 0, max: 0, total: 0 };
        }
        
        resolve(processedData);
      }, 0);
    });
  }, [downsampleData, selectedRange.hours]);

  // Batch updates to state
  const updateChartState = useCallback((processedData: any) => {
    // Use a single state update batch for performance
    setChartData(processedData.chartData);
    setStats(processedData.stats);
    setLoading(false);
    setError(null);
  }, []);

  // Add zoom level to interval mapping
  const getIntervalForZoom = (baseInterval: number, zoomLevel: number) => {
    // When zoomed in (zoomLevel > 1), decrease interval to show more points
    // When zoomed out (zoomLevel < 1), increase interval to show fewer points
    return Math.max(60, Math.floor(baseInterval / zoomLevel)); // Minimum 60 seconds interval
  };

  // Modify loadData function to use dynamic interval
  const loadData = useCallback(async () => {
    try {
      if (!apiKey) {
        setError('API key is missing');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      
      const cacheKey = `${feed.id}-${selectedRange.hours}-${zoomLevel}`;
      
      const now = Date.now();
      const cachedData = dataCache[cacheKey];
      if (cachedData && (now - cachedData.timestamp < CACHE_EXPIRATION)) {
        const processedData = await processDataInBackground(cachedData.data);
        updateChartState(processedData);
        return;
      }
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      abortControllerRef.current = new AbortController();
      
      // Calculate dynamic interval based on zoom level
      const baseInterval = selectedRange.interval;
      const dynamicInterval = getIntervalForZoom(baseInterval, zoomLevel);
      
      const rawData = await fetchFeedData(
        feed.id, 
        selectedRange.hours, 
        apiKey,
        dynamicInterval
      );
      
      setDataCache(prev => ({
        ...prev,
        [cacheKey]: {
          data: rawData,
          timestamp: now,
          range: selectedRange.hours
        }
      }));
      
      const processedData = await processDataInBackground(rawData);
      updateChartState(processedData);
      
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        let errorMessage = 'An error occurred while loading data';
        
        if (err.message.includes('HTTP error! Status: 500')) {
          errorMessage = 'Server error. Please try again later or select a different time range.';
        } else if (err.message.includes('Network request failed')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (err.message.includes('API key')) {
          errorMessage = 'API key error. Please check your settings.';
        }
        
        setError(errorMessage);
        setLoading(false);
      }
    }
  }, [apiKey, feed.id, selectedRange, dataCache, processDataInBackground, updateChartState, zoomLevel]);

  // Add effect to reload data when zoom level changes
  useEffect(() => {
    loadData();
  }, [loadData, zoomLevel]);

  // Handle chart tooltip display
  const handleDataPointClick = useCallback((data: any, index: number) => {
    setHoveredPoint({
      x: index,
      y: data.value,
      value: data.value,
      label: data.label
    });
  }, []);

  // Clear tooltip on chart touch end
  const handleChartTouchEnd = useCallback(() => {
    setTimeout(() => {
      setHoveredPoint(null);
    }, 2000); // Keep tooltip visible for 2 seconds
  }, []);

  // Memoize chart config for performance - Enhanced for theme colors
  const enhancedChartConfig = useMemo(() => ({
    ...CHART_CONFIG,
    backgroundColor: colors.background,
    backgroundGradientFrom: colors.background,
    backgroundGradientTo: colors.background,
    color: () => colors.primary,
    labelColor: () => colors.text,
    propsForLabels: {
      fontSize: 10,
      fontWeight: '500',
      color: colors.text,
    },
    propsForBackgroundLines: {
      strokeWidth: 1,
      strokeDasharray: '3,3',
      stroke: colors.border,
    },
    propsForDots: {
      r: "3",
      strokeWidth: "1",
      stroke: colors.primary,
      fill: colors.background,
    },
    formatYLabel: (value: string) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return '0';
      return numValue.toFixed(1);
    },
    formatXLabel: (value: string) => value,
    areaUnderLine: true,
    fillShadowGradient: colors.primary,
    fillShadowGradientOpacity: 0.2,
    decimalPlaces: 1,
    scrollable: true,
    withInnerLines: true,
    withOuterLines: false,
    withShadow: false,
    withHorizontalLabels: true,
    withVerticalLabels: true,
  }), [colors]);

  // Memoize time range buttons to avoid re-renders
  const timeRangeButtons = useMemo(() => (
    TIME_RANGES_ARRAY.map((range) => (
      <TouchableOpacity
        key={range.hours}
        style={[
          styles.timeRangeButton,
          selectedRange.hours === range.hours && styles.selectedTimeRange,
          { 
            backgroundColor: selectedRange.hours === range.hours 
              ? colors.primary 
              : colors.surface
          }
        ]}
        onPress={() => setSelectedRange(range)}
      >
        <FontAwesome
          name={range.icon}
          size={16}
          color={selectedRange.hours === range.hours ? colors.icon : colors.primary}
        />
        <Text style={[
          styles.timeRangeText,
          { color: selectedRange.hours === range.hours ? colors.icon : colors.text }
        ]}>
          {range.label}
        </Text>
      </TouchableOpacity>
    ))
  ), [selectedRange, colors]);

  // Modify handlePinchGesture to trigger data reload
  const handlePinchGesture = (event: any) => {
    if (!isZooming) {
      setIsZooming(true);
      lastScale.current = event.nativeEvent.scale;
      baseZoomLevel.current = zoomLevel;
    }

    const scale = event.nativeEvent.scale;
    const scaleDiff = scale - lastScale.current;
    
    // Calculate new zoom level with smoother transition
    const newZoomLevel = Math.max(1, Math.min(5, baseZoomLevel.current + (scaleDiff * 0.5)));
    
    setZoomLevel(newZoomLevel);
    lastScale.current = scale;
  };

  const handlePinchStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      setIsZooming(false);
      lastScale.current = 1;
    }
  };

  // Modify zoom buttons to trigger data reload
  const handleZoomIn = () => {
    setZoomLevel(prev => {
      const newZoom = Math.min(5, prev + 0.5);
      return newZoom;
    });
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const newZoom = Math.max(1, prev - 0.5);
      return newZoom;
    });
  };

  // Chart rendering with windowed data - Enhanced for theme colors
  const renderChart = () => {
    if (!chartData || chartData.labels.length === 0 || chartData.values.length === 0) {
      return (
        <View style={styles.noDataContainer}>
          <Text style={[styles.noDataText, { color: colors.text }]}>No data available for the selected time range</Text>
          <Text style={[styles.noDataSubtext, { color: colors.textSecondary }]}>
            {selectedRange.hours >= 24 * 30 * 12 
              ? "Year view may contain a large amount of data. Try a shorter time range."
              : "Try selecting a different time range or check your connection."}
          </Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={loadData}>
            <Text style={[styles.retryButtonText, { color: colors.icon }]}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.retryButton, { backgroundColor: colors.surface, marginTop: 10 }]} 
            onPress={() => setSelectedRange(TIME_RANGES_ARRAY[0])}
          >
            <Text style={[styles.retryButtonText, { color: colors.text }]}>Try Different Time Range</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Ensure all values are valid numbers
    const validValues = chartData.values.map(value => {
      const numValue = parseFloat(String(value));
      return isNaN(numValue) ? 0 : numValue;
    });

    // Calculate interval for x-axis labels based on data length
    const totalPoints = chartData.labels.length;
    let labelInterval = 1;
    if (totalPoints > 20) labelInterval = Math.ceil(totalPoints / 20);
    if (totalPoints > 50) labelInterval = Math.ceil(totalPoints / 15);
    if (totalPoints > 100) labelInterval = Math.ceil(totalPoints / 10);

    // Format data for gifted-charts - Theme style
    const data = chartData.labels.map((label, index) => {
      // Parse the date from the label
      let date;
      try {
        if (!isNaN(Number(label))) {
          date = new Date(Number(label));
        } else if (/^\d{2}:\d{2}$/.test(label)) {
          // Handle HH:mm format
          const [hours, minutes] = label.split(':').map(Number);
          date = new Date();
          date.setHours(hours, minutes, 0, 0);
        } else {
          date = new Date(label);
        }
      } catch (err) {
        console.warn('Error parsing date:', err);
      }

      // Format the label to show day/month
      let formattedLabel = label;
      if (date && !isNaN(date.getTime())) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        formattedLabel = `${day}/${month}`;
      }

      return {
        value: validValues[index],
        label: index % labelInterval === 0 ? formattedLabel : '', // Only show label at intervals
        dataPointText: validValues[index].toFixed(1),
        color: validValues[index] < 0 ? colors.error : colors.primary,
        onPress: () => handleDataPointClick({ value: validValues[index], label: formattedLabel }, index)
      };
    });

    return (
      <PinchGestureHandler
        onGestureEvent={handlePinchGesture}
        onHandlerStateChange={handlePinchStateChange}
      >
        <View style={styles.chartWrapper}>
          <LineChart
            data={data}
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            spacing={CHART_WIDTH / (data.length > 30 ? data.length / zoomLevel : data.length || 1)}
            endSpacing={5}
            initialSpacing={5}
            color={colors.primary}
            thickness={1}
            startFillColor={colors.primary}
            endFillColor={colors.background}
            startOpacity={0.3}
            endOpacity={0.05}
            backgroundColor={colors.background}
            xAxisColor={colors.border}
            yAxisColor={colors.border}
            xAxisLabelTextStyle={{ 
              color: colors.text, 
              fontSize: 10,
              width: (CHART_WIDTH / (data.length || 1)) * labelInterval,
              textAlign: 'center'
            }}
            yAxisTextStyle={{ color: colors.text, fontSize: 10 }}
            hideDataPoints={data.length > 10}
            dataPointsColor={colors.primary}
            dataPointsRadius={3}
            noOfSections={5}
            yAxisOffset={0}
            yAxisLabelWidth={40}
            xAxisLabelsHeight={20}
            rotateLabel={false}
            curved={false}
            rulesType="solid"
            rulesColor={colors.border}
            pointerConfig={{
              pointerStripHeight: CHART_HEIGHT,
              pointerStripColor: colors.border,
              pointerStripWidth: 1,
              pointerColor: colors.primary,
              radius: 4,
              pointerLabelWidth: 100,
              pointerLabelHeight: 30,
              activatePointersOnLongPress: true,
              autoAdjustPointerLabelPosition: true,
              pointerLabelComponent: (items: any) => {
                return (
                  <View style={[styles.tooltip, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.tooltipText, { color: colors.text }]}>
                      {items[0].label}: {items[0].value.toFixed(2)}
                    </Text>
                  </View>
                );
              },
            }}
          />
          
          {/* Theme-style overlay tooltip */}
          {hoveredPoint && (
            <View style={[styles.hoverTooltip, { backgroundColor: colors.surface }]}>
              <Text style={[styles.tooltipText, { color: colors.text }]}>
                {hoveredPoint.label}: {hoveredPoint.value.toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      </PinchGestureHandler>
    );
  };

  // Memoize stats section to prevent unnecessary re-renders - Enhanced for theme colors
  const statsSection = useMemo(() => {
    if (!stats) return null;
    
    return (
      <View style={[styles.statsContainer, { 
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 4,
      }]}>
        <View style={[styles.statItem, { 
          borderColor: colors.border,
          borderBottomWidth: 1,
        }]}>
          <Text style={[styles.statLabel, { color: colors.text }]}>Mean</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats.mean.toFixed(2)}</Text>
        </View>
        <View style={[styles.statItem, { 
          borderColor: colors.border,
          borderBottomWidth: 1,
        }]}>
          <Text style={[styles.statLabel, { color: colors.text }]}>Min</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats.min.toFixed(2)}</Text>
        </View>
        <View style={[styles.statItem, { 
          borderColor: colors.border,
          borderBottomWidth: 1,
        }]}>
          <Text style={[styles.statLabel, { color: colors.text }]}>Max</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats.max.toFixed(2)}</Text>
        </View>
        <View style={[styles.statItem]}>
          <Text style={[styles.statLabel, { color: colors.text }]}>Total</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{stats.total.toFixed(2)}</Text>
        </View>
      </View>
    );
  }, [stats, colors]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.headerContent}>
        <TouchableOpacity 
              style={styles.backButton}
              onPress={onBack}
        >
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>
              {feed.name} - {selectedRange.label}
            </Text>
            <View style={styles.zoomControls}>
              <TouchableOpacity 
                style={[styles.zoomButton, { backgroundColor: colors.surface }]} 
                onPress={handleZoomOut}
              >
                <MaterialIcons name="remove" size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.zoomButton, { backgroundColor: colors.surface }]} 
                onPress={handleZoomIn}
              >
                <MaterialIcons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
      </View>

      <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.timeRangeContainer}>
        {timeRangeButtons}
          </View>

      {loading ? (
            <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading data...</Text>
        </View>
      ) : error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={48} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
              <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={loadData}>
            <Text style={[styles.retryButtonText, { color: colors.icon }]}>Retry</Text>
          </TouchableOpacity>
        </View>
          ) : (
            <View style={styles.chartWrapper}>
            {renderChart()}
          {statsSection}
        </View>
      )}
        </ScrollView>
    </View>
    </GestureHandlerRootView>
  );
};

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
    fontSize: 18, 
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  timeRangeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  timeRangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  selectedTimeRange: {
    borderWidth: 1,
  },
  timeRangeText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 12,
    marginBottom: 20,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  chartWrapper: {
    height: CHART_HEIGHT,
    marginBottom: 16,
    position: 'relative',
  },
  noDataContainer: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noDataText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 8,
  },
  noDataSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  tooltip: {
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  tooltipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  hoverTooltip: {
    position: 'absolute',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    zIndex: 10,
  },
  statsContainer: {
    marginTop: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  zoomControls: {
    flexDirection: 'row',
    marginLeft: 'auto',
    gap: 8,
  },
  zoomButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: "black",
  },
});

export default ChartView;