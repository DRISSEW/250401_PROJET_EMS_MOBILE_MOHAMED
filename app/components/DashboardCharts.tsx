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
import { LineChart } from 'react-native-gifted-charts';
import { useLocalSearchParams } from 'expo-router';
import { useApiKey } from '../context/ApiKeyContext';
import ThemeProvider, { useTheme } from '../context/ThemeContext';
import { MaterialIcons, FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { PinchGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 220;

// Time range options for data visualization
const TIME_RANGES = [
  { hours: 24, label: '24h', icon: 'clock-o' as const, interval: 3600 },
  { hours: 24 * 7, label: '7d', icon: 'calendar-o' as const, interval: 86400 },
  { hours: 24 * 30, label: '30d', icon: 'calendar-o' as const, interval: 86400 },
  { hours: 24 * 365, label: '1y', icon: 'calendar-o' as const, interval: 86400 * 7 }
] as const;

// Convert TIME_RANGES object to array format for component use
const TIME_RANGES_ARRAY = [
  { hours: TIME_RANGES[0].hours, label: TIME_RANGES[0].label, icon: TIME_RANGES[0].icon, interval: TIME_RANGES[0].interval },
  { hours: TIME_RANGES[1].hours, label: TIME_RANGES[1].label, icon: TIME_RANGES[1].icon, interval: TIME_RANGES[1].interval },
  { hours: TIME_RANGES[2].hours, label: TIME_RANGES[2].label, icon: TIME_RANGES[2].icon, interval: TIME_RANGES[2].interval },
  { hours: TIME_RANGES[3].hours, label: TIME_RANGES[3].label, icon: TIME_RANGES[3].icon, interval: TIME_RANGES[3].interval },
];

// Define color palette for different lines
const ITEM_COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33A8'];

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
  const items = params?.items ? JSON.parse(params.items as string) : [];
  const dashboardName = params?.dashboardName as string || '';

  const isMounted = useRef(true);
  const [selectedRange, setSelectedRange] = useState(TIME_RANGES_ARRAY[0]);
  const [selectedMaxValue, setSelectedMaxValue] = useState('defaults');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{ [key: string]: Array<{value: number, date: string, timestamp: number}> }>({});
  const [liveValues, setLiveValues] = useState<{ [key: string]: number }>({});
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const lastScale = useRef(1);
  const baseZoomLevel = useRef(1);
  const scrollViewRef = useRef<ScrollView>(null);

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
  }, [isZooming, zoomLevel]);

  const handlePinchStateChange = useCallback((event: any) => {
    if (event.nativeEvent.state === 'END') {
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
      // 24-hour format: "HH:MM"
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (selectedRange.hours <= 24 * 7) {
      // Day and hour: "DD HH:00"
      return `${date.getDate()}/${date.getMonth()+1} ${date.getHours()}:00`;
    } else if (selectedRange.hours <= 24 * 30) {
      // Day only: "DD/MM"
      return `${date.getDate()}/${date.getMonth()+1}`;
    } else {
      // Month only: "MMM"
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
    if (!isMounted.current) return;
    try {
      const updatedValues: { [key: string]: number } = {};
      await Promise.all(
        (items || []).map(async (item: any) => {
          try {
            if (!item?.id || !apiKey) return;
            const res = await fetch(
              `http://electricwave.ma/energymonitoring/feed/value.json?id=${item.id}&apikey=${apiKey}`
            );
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            const value = parseFloat(Number(data).toFixed(2)) || 0;
            updatedValues[item.id] = value;
          } catch (err) {
            console.error(`Error fetching live value for Equilibrage ${item?.id}:`, err);
            updatedValues[item?.id] = 0;
          }
        })
      );
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
    if (!isMounted.current) return; // Ignore if the component is unmounted
    if (dashboardName !== 'MultiCourant' && dashboardName !== 'Multipuissance') return; // Only fetch if a chart is displayed

    try {
      const staticValues: { [key: string]: number } = {};

      // Generate static values for each item
      items.forEach((item: any, index: number) => {
        staticValues[item.id] = (index + 1) * 10; // Example: Assign static values like 10, 20, 30, etc.
      });

      if (isMounted.current) {
        console.log('Static Values for Other Dashboards:', staticValues); // Log static values
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
      const interval = setInterval(fetchEquilibrageLiveValues, 100);
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

  // Add a cache object to store fetched data
  const dataCache: { [key: string]: Array<{ value: number; date: string; timestamp: number }> } = {};

  // Fetch historical data with caching
  // Updated fetchHistoricalData function to better handle time series data
const fetchHistoricalData = async () => {
  try {
    setLoading(true);

    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (selectedRange.hours * 3600); // Convert hours to seconds
    const interval = getIntervalForZoom(selectedRange.interval, zoomLevel);
    
    console.log(`Fetching data from ${new Date(startTime * 1000)} to ${new Date(now * 1000)} with interval ${interval}s`);

    const history: { [key: string]: Array<{ value: number; date: string; timestamp: number }> } = {};

    await Promise.all(items.map(async (item) => {
      const cacheKey = `${item.id}-${startTime}-${now}-${interval}`;

      // Check if data is already in the cache
      if (dataCache[cacheKey]) {
        console.log(`Using cached data for ${item.id}`);
        history[item.id] = dataCache[cacheKey];
        return;
      }

      try {
        const url = `http://electricwave.ma/energymonitoring/feed/data.json?id=${item.id}&start=${startTime * 1000}&end=${now * 1000}&interval=${interval}&apikey=${apiKey}`;
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();

        const formattedData = data.map((point: any) => {
          const timestamp = point[0];
          return {
            value: parseFloat(Number(point[1]).toFixed(2)) || 0,
            date: new Date(timestamp * 1000).toISOString(),
            timestamp: timestamp,
          };
        });

        // Store the fetched data in the cache
        dataCache[cacheKey] = formattedData;
        history[item.id] = formattedData;
      } catch (err) {
        console.error(`Error fetching data for ${item.id}:`, err);
        history[item.id] = [];
      }
    }));

    console.log('Fetched Historical Data:', Object.keys(history));
    setChartData(history);
  } catch (error) {
    console.error('Error fetching data:', error);
    setError('Failed to load data');
  } finally {
    setLoading(false);
  }
};

  // Update renderLineChart to use the zoom controls
  const renderLineChart = useCallback((item: any, index: number) => {
    if (!item?.id || !chartData[item.id]) return null;
    
    const data = chartData[item.id] || [];
    if (!data.length) return null;

    const color = getColorForItem(item, index);
    const maxValue = Math.max(...data.map((point) => point.value || 0), 0);
    const yAxisLabels = Array.from({ length: 5 }, (_, i) =>
      Math.round((maxValue * (i + 1)) / 5).toString()
    );

    const formattedData = data.map((point) => ({
      value: point.value || 0,
      label: formatXAxisLabel(point.timestamp),
    }));

    return (
      <View style={{ flex: 1 }}>
        <PinchGestureHandler
          onGestureEvent={handlePinchGesture}
          onHandlerStateChange={handlePinchStateChange}
        >
          <View
            style={[
              styles.lineChartCard,
              { backgroundColor: colors.surface, shadowColor: colors.shadow },
            ]}
          >
            <Text style={[styles.chartTitle, { color: colors.text }]}>
              {item.name || 'Unnamed Item'}
            </Text>
            <View style={styles.lineChartWrapper}>
              <LineChart
                data={formattedData}
                height={CHART_HEIGHT}
                width={Math.max(SCREEN_WIDTH - 40, formattedData.length * 50)}
                color={color}
                thickness={2}
                spacing={50}
                initialSpacing={20}
                yAxisLabelTexts={yAxisLabels}
                dataPointsColor={color}
                yAxisColor={colors.border}
                xAxisColor={colors.border}
                rulesType="solid"
                rulesColor={colors.border + '40'}
                isAnimated={false}
                showVerticalLines
                verticalLinesColor={colors.border + '40'}
                yAxisTextStyle={{ color: colors.text }}
                xAxisLabelTextStyle={{ color: colors.text }}
                dataPointsHeight={6}
                dataPointsWidth={6}
                curved
                noOfVerticalLines={formattedData.length}
              />
            </View>
          </View>
        </PinchGestureHandler>
      </View>
    );
  }, [chartData, colors, handlePinchGesture, handlePinchStateChange]);
  
  const renderMultipleCourantChartAlternative = useCallback(() => {
  if (Object.keys(chartData).length === 0) return null;

  // Find the maximum value across all datasets for Y-axis scaling
  let maxValue = 0;
  items.forEach((item) => {
    const itemData = chartData[item.id] || [];
    const itemMax = Math.max(...itemData.map((point) => point.value), 0);
    maxValue = Math.max(maxValue, itemMax);
  });

  // Round up the maxValue to a nice number for the y-axis
  maxValue = Math.ceil(maxValue / 500) * 500;
  if (maxValue < 1000) maxValue = 1000;

  // Calculate the total width needed for all data points
  const totalDataPoints = Math.max(...items.map((item) => (chartData[item.id] || []).length));
  const chartWidth = Math.max(SCREEN_WIDTH - 60, totalDataPoints * 50);

  // Generate datasets for the multi-line chart
  const datasets = items.map((item, index) => {
    const data = chartData[item.id] || [];
    const color = getColorForItem(item, index);
    
    return {
      id: item.id,
      name: item.name,
      data: data.map(point => ({
        value: point.value,
        label: formatXAxisLabel(point.timestamp),
        timestamp: point.timestamp
      })),
      color: color
    };
  });

  // Sort datasets to ensure the total line appears on top if it exists
  const sortedDatasets = [...datasets].sort((a, b) => {
    if (a.name.includes('TOTALE')) return 1;
    if (b.name.includes('TOTALE')) return -1;
    return 0;
  });

  // Generate y-axis labels
  const yAxisLabels = Array.from({ length: 5 }, (_, i) => 
    Math.round((maxValue * (i + 1)) / 5).toString()
  );

  return (
    <View style={[styles.lineChartCard, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
      {/* Chart Title */}
      <Text style={[styles.chartTitle, { color: colors.text }]}>
        {dashboardName === 'Multipuissance' ? 'Power Consumption (W)' : 'Current Measurement (A)'}
      </Text>

      {/* Legend */}
      <View style={styles.legendContainer}>
        {sortedDatasets.map((dataset) => (
          <View key={dataset.id} style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: dataset.color }]} />
            <Text style={[styles.legendText, { color: colors.text }]}>{dataset.name}</Text>
          </View>
        ))}
      </View>

      {/* Multi-line Chart Container */}
      <View style={styles.chartContainer}>
        {/* Sticky Y-Axis */}
        <View style={[styles.yAxisContainer, { backgroundColor: colors.surface }]}>
          <LineChart
            data={[{value: 0}, {value: maxValue}]}
            height={300}
            width={40}
            noOfSections={5}
            thickness={0}
            hideDataPoints
            yAxisTextStyle={{ 
              color: colors.textSecondary,
              fontSize: 12,
              fontWeight: '500'
            }}
            yAxisLabelTexts={yAxisLabels}
            yAxisColor={colors.border}
            rulesType="solid"
            rulesColor={colors.border + '40'}
            hideYAxisText={false}
          />
        </View>

        {/* Scrollable Chart Area */}
        <ScrollView 
          ref={scrollViewRef}
          horizontal 
          showsHorizontalScrollIndicator={true}
          style={styles.chartScrollView}
        >
          <View style={[styles.chartContent, { width: chartWidth }]}>
            {/* Background grid */}
            <View style={[styles.gridOverlay, { width: chartWidth }]}>
              <LineChart
                data={[{value: 0}, {value: maxValue}]}
                height={300}
                width={chartWidth}
                noOfSections={5}
                thickness={0}
                hideDataPoints
                showVerticalLines
                initialSpacing={20}
                spacing={50}
                xAxisLabelTextStyle={{
                  color: colors.textSecondary,
                  fontSize: 10,
                  fontWeight: '500',
                  rotation: 45,
                  textAlign: 'center',
                  width: 40
                }}
                yAxisColor={colors.border}
                xAxisColor={colors.border}
                rulesType="solid"
                rulesColor={colors.border + '40'}
                hideYAxisText={true}
                noOfVerticalLines={Math.min(20, totalDataPoints)}
              />
            </View>
            
            {/* Individual line charts layered on top */}
            {sortedDatasets.map((dataset) => {
              if (!dataset.data.length) return null;
              
              return (
                <View key={dataset.id} style={[styles.chartOverlay, { width: chartWidth }]}>
                  <LineChart
                    data={dataset.data}
                    height={300}
                    width={chartWidth}
                    color={dataset.color}
                    thickness={dataset.name.includes('TOTALE') ? 3 : 2}
                    hideDataPoints={dataset.data.length > 30}
                    dataPointsColor={dataset.color}
                    startFillColor="transparent"
                    endFillColor="transparent"
                    initialSpacing={20}
                    spacing={50}
                    hideYAxisText={true}
                    isAnimated={false}
                    curved
                  />
                </View>
              );
            })}
            
            {/* X-Axis Labels */}
            <View style={[styles.xAxisLabels, { width: chartWidth }]}>
              {datasets[0]?.data.filter((_, i) => i % 3 === 0).map((point, i) => (
                <Text 
                  key={i} 
                  style={[styles.xAxisLabel, { color: colors.textSecondary }]}
                >
                  {point.label}
                </Text>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Zoom Controls */}
      <View style={styles.zoomControlsContainer}>
        <TouchableOpacity 
          style={[styles.zoomButton, { backgroundColor: colors.surface }]} 
          onPress={handleZoomOut}
        >
          <MaterialIcons name="zoom-out" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.zoomLevelText, { color: colors.text }]}>
          {zoomLevel.toFixed(1)}x
        </Text>
        <TouchableOpacity 
          style={[styles.zoomButton, { backgroundColor: colors.surface }]} 
          onPress={handleZoomIn}
        >
          <MaterialIcons name="zoom-in" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}, [chartData, colors, items, zoomLevel, handleZoomIn, handleZoomOut]);

  // Render charts based on dashboard type
  const renderCharts = useMemo(() => {
    if (dashboardName === 'MultiCourant' || dashboardName === 'Multipuissance') {
      return (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={styles.lineChartsContainer}
        >
          {renderMultipleCourantChartAlternative()}
        </ScrollView>
      );
    }
    return null;
  }, [dashboardName, renderMultipleCourantChartAlternative]);

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
        <View style={{flexDirection:'row', justifyContent:'space-between', paddingHorizontal:20}}>
          <Text style={[styles.sectionTitle,{color:colors.text}]}>Range line</Text>
        </View>    
      </View>
    );
  };

  // Refetch data when time range changes
  useEffect(() => {
    if (dashboardName !== 'Equilibrage') {
      fetchHistoricalData();
    }
  }, [selectedRange]);

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
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {dashboardName !== 'Equilibrage' && (
            <View style={styles.timeRangeContainer}>
              {timeRangeButtons}
            </View>
          )}

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
              {dashboardName === 'Equilibrage' ? renderBalanceCharts() : renderCharts}
            </View>
          )}
        </ScrollView>
      </View>
    </GestureHandlerRootView>
  );
};

export default DashboardCharts;


const additionalStyles = {
  chartContainer: {
    flexDirection: 'row',
    height: 350,
    position: 'relative',
    marginTop: 10,
  },
  yAxisContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 3,
  },
  chartScrollView: {
    flex: 1,
    marginLeft: 40, // Space for y-axis
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
  lineChartCard: {
    marginVertical: 12,
    padding: 15,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    width: SCREEN_WIDTH - 32,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  zoomLevelText: {
    marginHorizontal: 10,
    fontWeight: '500',
    fontSize: 14,
  },
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
  zoomControls: {
    flexDirection: 'row',
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
    backgroundColor: 'red',
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
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
    marginBottom: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '500',
  },
  multipleCurrentValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  currentValueItem: {
    marginHorizontal: 10,
    marginVertical: 5,
  },
  currentValueLabel: {
    fontSize: 14,
    marginRight: 5,
  },
  currentValueText: {
    fontSize: 16,
    fontWeight: '600',
  },
  lineChartsContainer: {
    paddingBottom: 20,
    flexDirection: 'row',
    minWidth: SCREEN_WIDTH,
  },
  lineChartCard: {
    marginVertical: 12,
    padding: 15,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    width: '100%',
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
  chartScrollView: {
    flex: 1,
    marginLeft: 40, // Space for y-axis
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
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
});