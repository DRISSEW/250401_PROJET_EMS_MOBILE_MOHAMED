import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LineChart, lineDataItem } from 'react-native-gifted-charts';
import { useLocalSearchParams } from 'expo-router';
import { useApiKey } from '../context/ApiKeyContext';
import ThemeProvider, { useTheme } from '../context/ThemeContext';
import { MaterialIcons, FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { PinchGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import MultiLineChart from './MultiLineChart';
import { fetchFeedValue, fetchFeedValues, fetchFeeds, fetchHistoricalData } from '../services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHART_HEIGHT =300;
const CACHE_EXPIRATION = 30 * 60 * 1000; // 30 minutes

// Time range options for data visualization
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

// Define color palette for different lines
const ITEM_COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33A8'];

// Update the ChartDataPoint interface to match our actual data structure
interface ChartDataPoint {
  value: number;
  timestamp: number;
  label?: string; // Optional label for display
}

// Remove the RawDataPoint interface since it's now redundant
interface ChartData {
  [key: string]: ChartDataPoint[];
}

interface Item {
  id: string;
  name: string;
}

interface Dataset {
  id: string;
  name: string;
  data: Array<{
    value: number;
    label: string;
    timestamp: number;
  }>;
  color: string;
}

interface LineDataItem {
  value: number;
  label: string;
  timestamp: number;
}

interface ChartDataset {
  data: LineDataItem[];
  color: string;
  thickness: number;
  name: string;
}

// Add these interfaces at the top of the file after other interfaces
interface ChartPoint {
  value: number;
  label: string;
  dataPointText: string;
}

// Update the LineData interface to match react-native-gifted-charts types
interface LineData {
  data: {
    value: number;
    label: string;
    dataPointText: string;
  }[];
  color: string;
  thickness: number;
  key: string;
  areaChart: boolean;
  startIndex: number;
  endIndex: number;
  showDataPoints?: boolean;
  dataPointsColor?: string;
  dataPointsRadius?: number;
  dataPointsShape?: string;
  showDataPointOnFocus?: boolean;
}

// Custom Bar Chart Component
const CustomBarChart = ({ 
  value, 
  maxValue, 
  color, 
  backgroundColor, 
  size = 130 
}: { 
  value: number; 
  maxValue: number; 
  color: string; 
  backgroundColor: string; 
  size?: number; 
}) => {
  const { colors } = useTheme();
  const percentage = Math.min(value / maxValue, 1);
  
  return (
    <View style={[styles.barChartContainer, { height: size }]}>
      <View style={[styles.barBackground,{backgroundColor:colors.border}]}>
        <View 
          style={[
            styles.barFill, 
            { 
              height: `${percentage * 100}%`, 
              backgroundColor: color 
            }
          ]} 
        />
      </View>
      <View style={styles.labelContainer}>
        <Text style={[styles.labelText, { color: colors.text }]}>{value.toFixed(2)}</Text>
        <Text style={[styles.unitLabel, { color: colors.textSecondary }]}> A</Text>
      </View>
    </View>
  );
};

const DashboardCharts = () => {
  const { apiKey } = useApiKey();
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const items = params?.items ? JSON.parse(params.items as string) as Item[] : [];
  const dashboardName = params?.dashboardName as string || '';

  const isMounted = useRef(true);
  const [selectedRange, setSelectedRange] = useState(TIME_RANGES_ARRAY[0]);
  const [selectedMaxValue, setSelectedMaxValue] = useState('defaults');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartData>({});
  const [liveValues, setLiveValues] = useState<{ [key: string]: number }>({});
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const lastScale = useRef(1);
  const baseZoomLevel = useRef(1);
  const scrollViewRef = useRef<ScrollView>(null);
  const [dataCache, setDataCache] = useState<Record<string, { 
    data: ChartData, 
    timestamp: number,
    range: number 
  }>>({});
  const [currentDatasetIndex, setCurrentDatasetIndex] = useState(0);
  const [renderedDatasets, setRenderedDatasets] = useState<any[]>([]);
  const [datasetsToRender, setDatasetsToRender] = useState<any[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [processedDatasets, setProcessedDatasets] = useState<Dataset[]>([]);

  // Update the points per pixel constant to show more data points
  const POINTS_PER_PIXEL = 30; // Increased from 15 to show more data points

  // Update the downsampleData function to preserve more points
  const downsampleData = useCallback((data: ChartDataPoint[], targetPoints = 2000) => {
    if (!data || !Array.isArray(data) || data.length <= targetPoints || data.length <= 2) {
      return data || [];
    }
    
    // Use LTTB (Largest-Triangle-Three-Buckets) algorithm for downsampling
    const lttbDownsample = (data: ChartDataPoint[], threshold: number) => {
      const result = [];
      let dataLength = data.length;
      let sampledIndex = 0;
      
      result.push(data[0]);
      
      for (let i = 2; i < dataLength - 2; i += 2) {
        let maxArea = -1;
        let maxAreaIndex = i;
        
        for (let j = i - 1; j < i + 2; j++) {
          const area = Math.abs(
            (data[sampledIndex].value - data[j].value) * (data[j + 1].timestamp - data[sampledIndex].timestamp) -
            (data[sampledIndex].value - data[j + 1].value) * (data[j].timestamp - data[sampledIndex].timestamp)
          );
          
          if (area > maxArea) {
            maxArea = area;
            maxAreaIndex = j;
          }
        }
        
        result.push(data[maxAreaIndex]);
        sampledIndex = i;
      }
      
      result.push(data[dataLength - 1]);
      return result;
    };
    
    // Adjust the factor based on time range to show more points for shorter ranges
    const factor = selectedRange.hours > 24 ? 1.5 : 1;
    const adjustedTargetPoints = Math.floor(targetPoints / factor);
    
    return lttbDownsample(data, adjustedTargetPoints);
  }, [selectedRange.hours]);

  // Update the processDataInBackground function to handle more data points
  const processDataInBackground = useCallback((rawData: ChartData) => {
    return new Promise<ChartData>((resolve) => {
      const processedData: ChartData = {};
      const targetPoints = Math.floor(SCREEN_WIDTH * POINTS_PER_PIXEL);

      Object.entries(rawData).forEach(([key, data]) => {
        // Only downsample if we have significantly more points than needed
        if (data.length > targetPoints * 1.5) {
          processedData[key] = downsampleData(data, targetPoints);
        } else {
          // If we have a reasonable number of points, use all of them
          processedData[key] = data;
        }
      });

      resolve(processedData);
    });
  }, [downsampleData]);

  // Add zoom level to interval mapping
  const getIntervalForZoom = (baseInterval: number, zoomLevel: number) => {
    return Math.max(60, Math.floor(baseInterval / zoomLevel));
  };

  // Handle pinch gesture for zooming
  const handlePinchGesture = useCallback((event: any) => {
    if (!isZooming) {
      setIsZooming(true);
      lastScale.current = event.nativeEvent.scale;
      baseZoomLevel.current = zoomLevel;
    }

    const scale = event.nativeEvent.scale;
    const scaleDiff = scale - lastScale.current;
    const newZoomLevel = Math.max(1, Math.min(5, baseZoomLevel.current + (scaleDiff * 0.5)));
    setZoomLevel(newZoomLevel);
    lastScale.current = scale;
  }, []);

  const handlePinchStateChange = useCallback((event: any) => {
    if (event.nativeEvent.state === State.END) {
      setIsZooming(false);
      lastScale.current = 1;
    }
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(5, prev + 0.5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(1, prev - 0.5));
  }, []);

  // Format timestamp for x-axis based on time range
  const formatXAxisLabel = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    
    if (selectedRange.hours <= 24) {
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (selectedRange.hours <= 24 * 7) {
      return `${date.getDate()}/${date.getMonth()+1} ${date.getHours()}:00`;
    } else if (selectedRange.hours <= 24 * 30) {
      return `${date.getDate()}/${date.getMonth()+1}`;
    } else {
      return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()];
    }
  };

  // Memoize time range buttons
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

  // Generate colors based on item and value
  const getColorForItem = (item: any, index: number) => {
    return ITEM_COLORS[index % ITEM_COLORS.length];
  };

  // Helper function to get the appropriate unit based on dashboard name
  const getUnitForDashboard = (name: string) => {
    switch (name) {
      case 'Multipuissance': return 'W';
      case 'MultiCourant': return 'A';
      case 'Temperature': return '°C';
      case 'Consommation': return 'kWh';
      default: return '';
    }
  };

  // Function to fetch live values for "Equilibrage"
  const fetchEquilibrageLiveValues = async () => {
    if (!isMounted.current || !apiKey) return;
    try {
      const feedIds = items.map(item => item.id);
      const updatedValues = await fetchFeedValues(feedIds, apiKey);
      if (isMounted.current) {
        console.log('Equilibrage Live Values:', updatedValues);
        setLiveValues(updatedValues);
      }
    } catch (error) {
      console.error('Error fetching live values for Equilibrage:', error);
      setError('Failed to load live data for Equilibrage');
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  // Function to fetch static values for other dashboards
  const fetchOtherLiveValues = async () => {
    if (!isMounted.current || !apiKey) return;
    if (dashboardName !== 'MultiCourant' && dashboardName !== 'Multipuissance') return;

    try {
      const feedIds = items.map(item => item.id);
      const staticValues = await fetchFeedValues(feedIds, apiKey);
      if (isMounted.current) {
        console.log('Static Values for Other Dashboards:', staticValues);
        setLiveValues(staticValues);
      }
    } catch (error) {
      if (isMounted.current) {
        console.error('Error setting static values:', error);
        setError('Failed to load static data');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const handleBack = () => {
    isMounted.current = false; // Mark the component as unmounted
    router.back(); // Navigate back
  };

  useEffect(() => {
    if (dashboardName === 'Equilibrage') {
      fetchEquilibrageLiveValues();
      const interval = setInterval(fetchEquilibrageLiveValues, 3000);
      return () => clearInterval(interval);
    } else {
      // Comment out the static value reload logic
      /*
      if (!loading) {
        fetchOtherLiveValues();
        const interval = setInterval(fetchOtherLiveValues, 100);
        return () => clearInterval(interval);
      }
      */
    }
  }, [dashboardName, loading]);

  // Rename the local function to avoid naming conflict with the imported one
  const fetchHistoricalDataForDashboard = async () => {
    if (!apiKey) {
      setError('API key is required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const now = Math.floor(Date.now() / 1000);
      const startTime = now - (selectedRange.hours * 3600);
      const interval = getIntervalForZoom(selectedRange.interval, zoomLevel);
      
      const cacheKey = `${dashboardName}-${startTime}-${now}-${interval}`;
      const cachedData = dataCache[cacheKey];
      
      if (cachedData && (Date.now() - cachedData.timestamp < CACHE_EXPIRATION)) {
        const processedData = await processDataInBackground(cachedData.data);
        setChartData(processedData);
        setLoading(false);
        return;
      }

      const feedIds = items.map(item => item.id);
      const history = await fetchHistoricalData(feedIds, selectedRange.hours, apiKey, interval);

      if (Object.keys(history).length > 0) {
        setDataCache(prev => ({
          ...prev,
          [cacheKey]: {
            data: history,
            timestamp: Date.now(),
            range: selectedRange.hours
          }
        }));

        const processedData = await processDataInBackground(history);
        setChartData(processedData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Update the useEffect that calls fetchHistoricalData
  useEffect(() => {
    if (dashboardName !== 'Equilibrage') {
      fetchHistoricalDataForDashboard();
    }
  }, [selectedRange, zoomLevel]);

  // Update renderLineChart to use the optimized implementation
  const renderLineChart = useCallback((item: Item, index: number) => {
  try {
    if (!item?.id || !chartData[item.id] || !Array.isArray(chartData[item.id])) {
      return null;
    }
    
    const data = chartData[item.id] || [];
    if (!data.length) return null;

    // Rest of chart rendering...
  } catch (error) {
    console.error('Error rendering line chart:', error);
    return (
      <View style={[styles.lineChartCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>
          {item.name || 'Error in Chart'}
            </Text>
        <Text style={[styles.errorText, { color: colors.text }]}>Error rendering chart</Text>
      </View>
    );
  }
  }, [chartData, colors, handlePinchGesture, handlePinchStateChange]);
  
  // Add useEffect to handle sequential rendering
  useEffect(() => {
    if (!isRendering && datasetsToRender.length > 0 && currentDatasetIndex < datasetsToRender.length) {
      setIsRendering(true);
      const timer = setTimeout(() => {
        setRenderedDatasets(prev => [...prev, datasetsToRender[currentDatasetIndex]]);
        setCurrentDatasetIndex(prev => prev + 1);
        setIsRendering(false);
      }, 100); // Small delay between rendering each line

      return () => clearTimeout(timer);
    }
  }, [currentDatasetIndex, datasetsToRender, isRendering]);

  // Reset rendering state when data changes
  useEffect(() => {
    if (chartData && items) {
      setCurrentDatasetIndex(0);
      setRenderedDatasets([]);
      setIsRendering(false);
    }
  }, [chartData, items]);

  // Update the CustomBarChart to use the selected max value
  const getMaxValueForChart = (value: number) => {
    switch (selectedMaxValue) {
      case '0.5':
        return 0.5;
      case '0.3':
        return 0.3;
      case '0.1':
        return 0.1;
      case '1':
        return 1;
      case 'defaults':
      default:
        // Default logic for max value
        if (value >= 10 && value < 20) return 20;
        if (value >= 20 && value < 50) return 50;
        if (value >= 50 && value < 100) return 100;
        if (value >= 100 && value < 200) return 200;
        if (value >= 200 && value < 500) return 500;
        if (value >= 500 && value < 1000) return 1000;
        if (value >= 1000) return Math.ceil(value / 1000) * 1000;
        return 10;
    }
  };

  // Update the renderBalanceCharts function
  const renderBalanceCharts = () => {
    const pieData = items.map((item: any, index: number) => {
      const value = liveValues[item.id] ?? 0;
      const maxValue = getMaxValueForChart(value);

      return {
        id: item.id,
        label: item.name,
        value,
        color: getColorForItem(item, index),
        maxValue
      };
    });

    return (
      <View style={{flexDirection:'column',gap:10}}>
        <View style={[styles.chartsGrid]}>
          {pieData.map((item: any, index: number) => (
            <View key={index} style={{flexDirection:'column', justifyContent:'space-between',alignItems:'center'}}>
              <View style={[styles.chartCard, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
                <CustomBarChart 
                  value={item.value}
                  maxValue={item.maxValue}
                  color={item.color}
                  backgroundColor={colors.border}
                  size={130}
                />
              </View>
              <View style={styles.labelContainer}>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <Text style={[styles.labelText, { color: colors.text }]}>{item.label}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{flexDirection:'row', justifyContent:'space-between', paddingHorizontal:20}}>
          <Text style={[styles.sectionTitle,{color:colors.text}]}>Custom Range</Text>
        </View>
        <View style={{flexDirection:'row', justifyContent:'flex-start', alignItems:'center', gap:10}}>
          <View style={[styles.checkboxContainer, { backgroundColor: colors.surface }]}>
            <View style={styles.checkboxRow}>
              <TouchableOpacity 
                style={[styles.checkbox, { borderColor: colors.border }]}
                onPress={() => setSelectedMaxValue('defaults')}
              >
                <View style={[
                  styles.checkboxInner, 
                  { backgroundColor: selectedMaxValue === 'defaults' ? colors.primary : 'transparent' }
                ]} />
              </TouchableOpacity>
              <Text style={[styles.checkboxLabel, { color: colors.text }]}>Default</Text>
            </View>
            
            <View style={styles.checkboxRow}>
              <TouchableOpacity 
                style={[styles.checkbox, { borderColor: colors.border }]}
                onPress={() => setSelectedMaxValue('0.1')}
              >
                <View style={[
                  styles.checkboxInner, 
                  { backgroundColor: selectedMaxValue === '0.1' ? colors.primary : 'transparent' }
                ]} />
              </TouchableOpacity>
              <Text style={[styles.checkboxLabel, { color: colors.text }]}>0.1</Text>
            </View>

            <View style={styles.checkboxRow}>
              <TouchableOpacity 
                style={[styles.checkbox, { borderColor: colors.border }]}
                onPress={() => setSelectedMaxValue('0.3')}
              >
                <View style={[
                  styles.checkboxInner, 
                  { backgroundColor: selectedMaxValue === '0.3' ? colors.primary : 'transparent' }
                ]} />
              </TouchableOpacity>
              <Text style={[styles.checkboxLabel, { color: colors.text }]}>0.3</Text>
            </View>

            <View style={styles.checkboxRow}>
              <TouchableOpacity 
                style={[styles.checkbox, { borderColor: colors.border }]}
                onPress={() => setSelectedMaxValue('0.5')}
              >
                <View style={[
                  styles.checkboxInner, 
                  { backgroundColor: selectedMaxValue === '0.5' ? colors.primary : 'transparent' }
                ]} />
              </TouchableOpacity>
              <Text style={[styles.checkboxLabel, { color: colors.text }]}>0.5</Text>
            </View>
            
            <View style={styles.checkboxRow}>
              <TouchableOpacity 
                style={[styles.checkbox, { borderColor: colors.border }]}
                onPress={() => setSelectedMaxValue('1')}
              >
                <View style={[
                  styles.checkboxInner, 
                  { backgroundColor: selectedMaxValue === '1' ? colors.primary : 'transparent' }
                ]} />
              </TouchableOpacity>
              <Text style={[styles.checkboxLabel, { color: colors.text }]}>1</Text>
            </View>
          </View>
        </View>  
      </View>
    );
  };

  // Update the useEffect that processes chart data
  useEffect(() => {
    if (!chartData || !items || !Array.isArray(items)) {
      setProcessedDatasets([]);
      return;
    }

    const validItems = items.filter(item => 
      item && 
      item.id && 
      chartData[item.id] && 
      Array.isArray(chartData[item.id]) && 
      chartData[item.id].length > 0
    );

    if (validItems.length === 0) {
      setProcessedDatasets([]);
      return;
    }

    // Calculate max value
    let maxValue = 0;
    validItems.forEach(item => {
      try {
        if (chartData[item.id]) {
          const itemMax = Math.max(...chartData[item.id]
            .filter(point => point && typeof point.value === 'number')
            .map(point => point.value), 0);
          maxValue = Math.max(maxValue, itemMax);
        }
      } catch (e) {
        console.warn('Error calculating max value for item', item.id, e);
      }
    });

    maxValue = maxValue > 0 ? Math.ceil(maxValue / 500) * 500 : 1000;

    const newDatasets = validItems.map((item, index) => {
      try {
        const data = chartData[item.id] || [];
        const color = ITEM_COLORS[index % ITEM_COLORS.length];
        
        // Downsample data if there are too many points
        const maxPoints = 100;
        let processedData = data;
        if (data.length > maxPoints) {
          const step = Math.floor(data.length / maxPoints);
          processedData = data.filter((_, i) => i % step === 0);
        }
        
        const formattedData = processedData.map(point => ({
          value: point.value || 0,
          label: formatXAxisLabel(point.timestamp / 1000), // Convert ms to seconds
          timestamp: point.timestamp / 1000 // Convert ms to seconds
        }));

        return {
          id: item.id,
          name: item.name || `Item ${index + 1}`,
          data: formattedData,
          color: color
        };
      } catch (error) {
        console.warn('Error processing dataset:', item, error);
        return null;
      }
    }).filter((dataset): dataset is Dataset => dataset !== null);

    setProcessedDatasets(newDatasets);
  }, [chartData, items, formatXAxisLabel]);

  // Update the renderMultipleCourantChartAlternative function
const renderMultipleCourantChartAlternative = useCallback(() => {
  try {
    // Check if we have valid data to work with
    if (!chartData || Object.keys(chartData).length === 0) {
      console.log('No chart data available');
      return (
        <View style={[styles.lineChartCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>
            {dashboardName === 'Multipuissance' ? 'Power Consumption (W)' : 'Current Measurement (A)'}
          </Text>
          <Text style={[styles.errorText, { color: colors.text }]}>No chart data available</Text>
        </View>
      );
    }

    // Check if we have valid items
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.log('No items available');
      return (
        <View style={[styles.lineChartCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>
            {dashboardName === 'Multipuissance' ? 'Power Consumption (W)' : 'Current Measurement (A)'}
          </Text>
          <Text style={[styles.errorText, { color: colors.text }]}>No items available</Text>
        </View>
      );
    }

    return (
      <View style={[styles.lineChartCard, { backgroundColor: colors.surface }]}>
        <MultiLineChart
          data={chartData}
          items={items}
          dashboardName={dashboardName}
          colors={ITEM_COLORS}
          selectedRange={selectedRange}
        />
      </View>
    );
  } catch (error) {
    console.error('Chart rendering error:', error);
    return (
      <View style={[styles.lineChartCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>Chart Error</Text>
        <Text style={[styles.errorText, { color: colors.text }]}>
          Error: {(error as Error).message || 'Unknown error'}
        </Text>
      </View>
    );
  }
}, [chartData, colors, items, dashboardName, selectedRange]);

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.headerContent}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {dashboardName} {dashboardName !== 'Equilibrage' ? `- ${selectedRange.label}` : ''}
        </Text>
        {dashboardName !== 'Equilibrage' && (
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
        )}
      </View>
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {renderHeader()}
        {dashboardName !== 'Equilibrage' && (
          <View style={styles.timeRangeContainer}>
            {timeRangeButtons}
          </View>
        )}
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.text }]}>Loading data...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={48} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
              <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => {}}>
                <Text style={[styles.retryButtonText, { color: colors.icon }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.chartWrapper}>
              {dashboardName === 'Equilibrage'  ? renderBalanceCharts() : renderMultipleCourantChartAlternative()}
            </View>
          )}
        </ScrollView>
      </View>
    </GestureHandlerRootView>
  );
};

export default DashboardCharts;

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
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { 
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 8,
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
    margin: 16,
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
    marginTop: 56,
    position: 'relative',
    
  },
  zoomControls: {
    flexDirection: 'row',
    gap: 8,
  },
  chartsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    
  },
  chartCard: {
    marginVertical: 12,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    
  },
  centerLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  unitLabel: {
    fontSize: 12,
    fontWeight:'bold',
    marginTop: 2
  },
  labelContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  checkboxContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 8,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  barChartContainer: {
    width: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barBackground: {
    width: '60%',
    height: '85%',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 4,
    padding: 4,
    maxWidth: 200,
  },
  lineChartCard: {
    marginVertical: 12,
    padding: 15,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    width: SCREEN_WIDTH - 32,
    height: 220,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  lineChartWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  chartContainer: {
    flexDirection: 'row',
    height: 300,
    position: 'relative',
  },
  yAxisContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 3,
  },
  chartContent: {
    height: 300,
    position: 'relative',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  chartOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
    marginBottom: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 3,
    marginRight: 6,
  },
  legendText: {
    fontSize: 13,
    fontWeight: '500',
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 20,
    marginTop: 5,
  },
  xAxisLabel: {
    fontSize: 10,
    transform: [{ rotate: '-45deg' }],
  },
  zoomControlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
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
  zoomLevelText: {
    marginHorizontal: 10,
    fontWeight: '500',
    fontSize: 14,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  tooltipColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  tooltipText: {
    fontSize: 12,
  },
  chartScrollView: {
    marginBottom: 10,
  },
});