import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApiKey } from '../context/ApiKeyContext';
import { useTheme } from '../context/ThemeContext';
import { MaterialIcons, FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import isEqual from 'fast-deep-equal';
import MultiLineChart from './MultiLineChart';
import { fetchFeedValues, fetchHistoricalData } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 300;

// Time range options for data visualization
const TIME_RANGES = {
  DAY: { label: 'Day', value: 24 * 60 * 60, interval: 120 },
  WEEK: { label: 'Week', value: 7 * 24 * 60 * 60, interval: 900 },
  MONTH: { label: 'Month', value: 30 * 24 * 60 * 60, interval: 3600 },
  YEAR: { label: 'Year', value: 365 * 24 * 60 * 60, interval: 43200 },
};

const TIME_RANGES_ARRAY = [
  { hours: TIME_RANGES.DAY.value / 3600, label: TIME_RANGES.DAY.label, icon: 'clock-o' as const, interval: TIME_RANGES.DAY.interval },
  { hours: TIME_RANGES.WEEK.value / 3600, label: TIME_RANGES.WEEK.label, icon: 'calendar-o' as const, interval: TIME_RANGES.WEEK.interval },
  { hours: TIME_RANGES.MONTH.value / 3600, label: TIME_RANGES.MONTH.label, icon: 'calendar-o' as const, interval: TIME_RANGES.MONTH.interval },
  { hours: TIME_RANGES.YEAR.value / 3600, label: TIME_RANGES.YEAR.label, icon: 'calendar-o' as const, interval: TIME_RANGES.YEAR.interval },
];

// Define color palette for different lines
const ITEM_COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33A8','#f6ff00',];

// Interfaces
interface ChartDataPoint {
  value: number;
  timestamp: number;
  label?: string;
}

interface ChartData {
  [key: string]: ChartDataPoint[];
}

interface Item {
  id: string;
  name: string;
}

// Group definitions for Multigrandeurs
const MULTIGRANDEURS_GROUPS = [
  {
    label: 'Tension Simple',
    keys: ['VS', 'TENSION'],
  },
  {
    label: 'Puissance',
    keys: ['P1', 'P2', 'P3', 'P_PH1', 'P_PH2', 'P_PH3', 'p1', 'p2', 'p3'],
  },
  {
    label: 'Courant',
    keys: ['I1', 'I2', 'I3', 'i1', 'i2', 'i3', 'iph1', 'iph2', 'iph3'],
  },
  {
    label: 'Puissance Apparente',
    keys: ['S1', 'S2', 'S3', 's1', 's2', 's3'],
  },
  {
    label: 'Facteur de puissance',
    keys: ['cf1', 'cf2', 'cf3', 'CF1', 'CF2', 'CF3'],
  },
];

function groupMultigrandeursItems(items: Item[]) {
  const groups: { label: string; keys: string[]; items: Item[] }[] = [];
  MULTIGRANDEURS_GROUPS.forEach(group => {
    const groupItems = items.filter(item =>
      group.keys.some(key => item.name.toUpperCase().includes(key.toUpperCase()))
    );
    if (groupItems.length > 0) {
      groups.push({ label: group.label, keys: group.keys, items: groupItems });
    }
  });
  return groups;
}

const DashboardCharts = () => {
  const { apiKey } = useApiKey();
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const items = params?.items ? JSON.parse(params.items as string) as Item[] : [];
  const dashboardName = params?.dashboardName as string || '';
  
  // State
  const [selectedMaxValue, setSelectedMaxValue] = useState('defaults');
  const [chartData, setChartData] = useState<ChartData>({});
  const [liveValues, setLiveValues] = useState<{ [key: string]: number }>({});
  const [selectedRange, setSelectedRange] = useState(TIME_RANGES_ARRAY[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const isMounted = useRef(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const isDataFetched = useRef(false);

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

  // Get max value for charts
  const getMaxValueForChart = (value: number) => {
    // For Equilibrage dashboard
    if (dashboardName === 'Equilibrage') {
      switch (selectedMaxValue) {
        case '50': return 50;
        case '100': return 100;
        case '5': return 5;
        case '1': return 1;
        case 'defaults':
        default:
          if (value >= 10 && value < 20) return 20;
          if (value >= 20 && value < 50) return 50;
          if (value >= 50 && value < 100) return 100;
          if (value >= 100 && value < 200) return 200;
          if (value >= 200 && value < 500) return 500;
          if (value >= 500 && value < 1000) return 1000;
          if (value >= 1000) return Math.ceil(value / 1000) * 1000;
          return 10;
      }
    } else if (dashboardName === 'MultiCourant') {
      switch (selectedMaxValue) {
        case '50': return 50;
        case '100': return 100;
        case '5': return 5;
        case '1': return 1;
        case 'defaults':
        default:
          if (value >= 10 && value < 20) return 20;
          if (value >= 20 && value < 50) return 50;
          if (value >= 50 && value < 100) return 100;
          if (value >= 100 && value < 200) return 200;
          if (value >= 200 && value < 500) return 500;
          if (value >= 500 && value < 1000) return 1000;
          if (value >= 1000) return Math.ceil(value / 1000) * 1000;
          return 10;
      }
    } else if (dashboardName === 'Multipuissance') {
      switch (selectedMaxValue) {
        case '1000': return 1000;
        case '5000': return 5000;
        case '10000': return 10000;
        case 'defaults':
        default:
          if (value >= 100 && value < 200) return 200;
          if (value >= 200 && value < 500) return 500;
          if (value >= 500 && value < 1000) return 1000;
          if (value >= 1000 && value < 2000) return 2000;
          if (value >= 2000 && value < 5000) return 5000;
          if (value >= 5000 && value < 10000) return 10000;
          if (value >= 10000) return Math.ceil(value / 10000) * 10000;
          return 100;
      }
    } else {
      // Default behavior for other dashboards
      switch (selectedMaxValue) {
        case '0.5': return 0.5;
        case '0.3': return 0.3;
        case '0.1': return 0.1;
        case '1': return 1;
        case 'defaults':
        default:
          if (value >= 10 && value < 20) return 20;
          if (value >= 20 && value < 50) return 50;
          if (value >= 50 && value < 100) return 100;
          if (value >= 100 && value < 200) return 200;
          if (value >= 200 && value < 500) return 500;
          if (value >= 500 && value < 1000) return 1000;
          if (value >= 1000) return Math.ceil(value / 1000) * 1000;
          return 10;
      }
    }
  };

  // Fetch live values for Equilibrage, Multigrandeurs, and Temperature dashboards
  useEffect(() => {
    if (dashboardName !== 'Equilibrage' && dashboardName !== 'Multigrandeurs' && dashboardName !== 'Temperature') return;
    
    const fetchLiveValues = async () => {
      try {
        const feedIds = items.map(item => item.id);
        const updatedValues = await fetchFeedValues(feedIds, apiKey);
        setLiveValues(prevValues => {
          if (!isEqual(prevValues, updatedValues)) {
            return updatedValues;
          }
          return prevValues;
        });
      } catch (err) {
        console.error('Error fetching live values:', err);
        setError('Failed to load live data');
      } finally {
        setLoading(false);
      }
    };

    fetchLiveValues();
    const interval = setInterval(fetchLiveValues, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [dashboardName, apiKey, items]);

  // Initial data fetch for historical data
  useEffect(() => {
    if (dashboardName === 'Equilibrage' || dashboardName === 'Multigrandeurs' || !apiKey || items.length === 0 || isDataFetched.current) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const now = Math.floor(Date.now() / 1000);
        const startTime = now - (selectedRange.hours * 3600);
        
        // Fetch historical data
        const history = await fetchHistoricalData(
          items.map(item => item.id), 
          selectedRange.hours, 
          apiKey, 
          selectedRange.interval
        );
        
        if (history && typeof history === 'object') {
          setChartData(history);
          isDataFetched.current = true;
        }
      } catch (err) {
        console.error('Error fetching historical data:', err);
        setError('Failed to load historical data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [apiKey, dashboardName]);

  // Handle time range change
  useEffect(() => {
    if (dashboardName === 'Equilibrage' || !apiKey || items.length === 0) {
      return;
    }

    const fetchDataForRange = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const now = Math.floor(Date.now() / 1000);
        
        // Fetch historical data
        const history = await fetchHistoricalData(
          items.map(item => item.id), 
          selectedRange.hours, 
          apiKey, 
          selectedRange.interval
        );
        
        if (history && typeof history === 'object') {
          setChartData(history);
        }
      } catch (err) {
        console.error('Error fetching historical data:', err);
        setError('Failed to load historical data');
      } finally {
        setLoading(false);
      }
    };

    fetchDataForRange();
  }, [selectedRange, apiKey]); // Only re-fetch when time range changes

  // Custom Thermometer Component
  const CustomThermometer = ({ 
    value, 
    maxValue = 100,
    color = '#FF5733',
    backgroundColor,
    size = 80 
  }: { 
    value: number; 
    maxValue?: number; 
    color?: string; 
    backgroundColor: string; 
    size?: number; 
  }) => {
    const percentage = Math.min(value / maxValue, 1);
    const height = size * 0.8;
    const bulbSize = size * 0.25;
    
    return (
      <View style={[styles.thermometerContainer, { height: size }]}>
        <View style={[styles.thermometerStem, { 
          height: height,
          backgroundColor: backgroundColor,
          borderColor: colors.border,
          width: 12,
          marginBottom: -1.7,
          borderBottomWidth: 0,
          zIndex: 1,
        }]}>
          <View 
            style={[
              styles.thermometerFill, 
              { 
                height: `${percentage * 100}%`, 
                backgroundColor: color,
                 
              }
            ]} 
          />
        </View>
        <View style={[styles.thermometerBulb, { 
          width: bulbSize,
          height: bulbSize,
          backgroundColor: color,
          borderColor: colors.border,
          borderWidth: 2,
          zIndex: 0,
          
        }]} />
        <View style={styles.thermometerLabel}>
          <Text style={[styles.thermometerValue, { color: colors.text, fontSize: 16 }]}>{value.toFixed(1)}</Text>
          <Text style={[styles.thermometerUnit, { color: colors.textSecondary, fontSize: 12 }]}>°C</Text>
        </View>
      </View>
    );
  };

  // Render temperature values
  const renderTemperatureValues = () => {
    return (
      <View style={styles.temperatureContainer}>
        <View style={[styles.temperatureGrid, { 
          flexDirection: 'row', 
          justifyContent: 'space-around', 
          flexWrap: 'nowrap',
          alignItems: 'flex-start'
        }]}>
          {items.map((item, index) => (
            <View key={item.id} style={[styles.temperatureCard, { 
              backgroundColor: colors.surface,
              width: 90,
              height: 170,
              padding: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }]}>
              <CustomThermometer
                value={liveValues[item.id] || 0}
                maxValue={50}
                color={ITEM_COLORS[index % ITEM_COLORS.length]}
                backgroundColor={colors.border}
                size={70}
              />
              <Text style={[styles.feedName, { 
                color: colors.text, 
                fontSize: 12,
                textAlign: 'center',
                marginTop: 4,
                fontWeight: '500'
              }]}>
              </Text>
              <View style={[styles.labelContainer, { marginTop: 10, flexDirection: 'row', alignItems: 'center' }]}>
                <View style={[styles.colorDot, { backgroundColor: ITEM_COLORS[index % ITEM_COLORS.length] }]} />
                <Text style={[styles.labelText, { color: colors.text }]}>{item.name}</Text>
              </View>
            </View>
            
          ))}
        </View>
      </View>
    );
  };

  // Render live values (for Equilibrage dashboard)
  const renderLiveValues = () => (
    <View>
      <View style={styles.chartsGrid}>
        {items.sort().map((item, index) => (
          <View key={item.id} style={[styles.chartCard, { backgroundColor: colors.surface }]}>
            <CustomBarChart
              value={liveValues[item.id] || 0}
              maxValue={getMaxValueForChart(liveValues[item.id] || 0)} 
              color={ITEM_COLORS[index % ITEM_COLORS.length]}
              backgroundColor={colors.border}
              size={100}
            />
            <View style={[styles.labelContainer, {marginTop: 10, flexDirection: 'row', alignItems: 'center'}]}>
              <View style={[styles.colorDot, { backgroundColor: ITEM_COLORS[index % ITEM_COLORS.length] }]} />
              <Text style={[styles.labelText, { color: colors.text }]}>{item.name}</Text>
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
              onPress={() => setSelectedMaxValue('100')}
            >
              <View style={[
                styles.checkboxInner, 
                { backgroundColor: selectedMaxValue === '100' ? colors.primary : 'transparent' }
              ]} />
            </TouchableOpacity>
            <Text style={[styles.checkboxLabel, { color: colors.text }]}>100</Text>
          </View>

          <View style={styles.checkboxRow}>
            <TouchableOpacity 
              style={[styles.checkbox, { borderColor: colors.border }]}
              onPress={() => setSelectedMaxValue('50')}
            >
              <View style={[
                styles.checkboxInner, 
                { backgroundColor: selectedMaxValue === '50' ? colors.primary : 'transparent' }
              ]} />
            </TouchableOpacity>
            <Text style={[styles.checkboxLabel, { color: colors.text }]}>50</Text>
          </View>

          <View style={styles.checkboxRow}>
            <TouchableOpacity 
              style={[styles.checkbox, { borderColor: colors.border }]}
              onPress={() => setSelectedMaxValue('5')}
            >
              <View style={[
                styles.checkboxInner, 
                { backgroundColor: selectedMaxValue === '5' ? colors.primary : 'transparent' }
              ]} />
            </TouchableOpacity>
            <Text style={[styles.checkboxLabel, { color: colors.text }]}>5</Text>
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

  // Render historical data charts
  const renderHistoricalData = () => {
    if (loading) {
      return (
        <View style={[styles.lineChartCard, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading data...</Text>
        </View>
      );
    }
    
    if (error) {
      return (
        <View style={[styles.lineChartCard, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[styles.chartTitle, { color: colors.error }]}>{error}</Text>
        </View>
      );
    }

    if (!chartData || Object.keys(chartData).length === 0) {
      return (
        <View style={[styles.lineChartCard, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>No historical data available</Text>
        </View>
      );
    }
  
    if (!items || items.length === 0) {
      return (
        <View style={[styles.lineChartCard, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>No items selected</Text>
        </View>
      );
    }
    
    // Prepare and render the chart
    try {
      return (
        <View style={[styles.lineChartCard, { backgroundColor: colors.surface,marginTop:70 }]}>
          
          <MultiLineChart
            data={chartData} 
            items={items}
            dashboardName={dashboardName}
            colors={ITEM_COLORS}
            selectedRange={selectedRange}
          />
          
        </View>
      );
    } catch (err) {
      console.error('Error rendering chart:', err);
      return (
        <View style={[styles.lineChartCard, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[styles.chartTitle, { color: colors.error }]}>Error rendering chart</Text>
        </View>
      );
    }
  };

  // Render time range selector
  const renderTimeRangeSelector = () => {
    if (dashboardName === 'Equilibrage' || dashboardName === 'Multigrandeurs' || dashboardName === 'Temperature' ) return null;
    
    return (
      <View style={styles.timeRangeContainer}>
        {TIME_RANGES_ARRAY.map((range) => (
          <TouchableOpacity
            key={range.label}
            style={[
              styles.timeRangeButton,
              selectedRange.label === range.label && [styles.selectedTimeRange, { borderColor: colors.primary }],
              { backgroundColor: colors.surface }
            ]}
            onPress={() => setSelectedRange(range)}
          >
            <FontAwesome name={range.icon} size={16} color={selectedRange.label === range.label ? colors.primary : colors.text} />
            <Text
              style={[
                styles.timeRangeText,
                { color: selectedRange.label === range.label ? colors.primary : colors.text }
              ]}
            >
              {range.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // Render header
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
      </View>
    </View>
  );

  const renderMultigrandeursLiveValues = () => {
    const groups = groupMultigrandeursItems(items);
    return (
      <View style={styles.multigrandeursContainer}>
        {groups.map((group, groupIdx) => (
          <View key={group.label} style={{ marginBottom: 24 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{group.label}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>
              {group.keys.join(' | ')}
            </Text>
            <View style={[styles.multigrandeursGrid]}>
              {group.items.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.multigrandeursItem,
                    { backgroundColor: colors.surface, minWidth: 90, marginRight: 10, marginBottom: 10 }
                  ]}
                >
                  <Text style={[styles.multigrandeursLabel, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.multigrandeursValue, { color: colors.text }]}> 
                    {liveValues[item.id] !== undefined ? liveValues[item.id] : 'N/A'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  };

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
    const percentage = Math.min(value / maxValue, 1);
    const unit = dashboardName === 'Multipuissance' ? 'W' : 
                 dashboardName === 'MultiCourant' ? 'A' : '';
    
    return (
      <View style={[styles.barChartContainer, { height: size }]}>
        <View style={[styles.barBackground, { backgroundColor: colors.border }]}>
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
          <Text style={[styles.unitLabel, { color: colors.textSecondary }]}> {unit}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader()}
      {renderTimeRangeSelector()}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.text }]}>Loading data...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : (
          <>
            {dashboardName === 'Multigrandeurs' ? (
              renderMultigrandeursLiveValues()
            ) : dashboardName === 'Equilibrage' ? (
              renderLiveValues()
            ) : dashboardName === 'Temperature' ? (
              renderTemperatureValues()
            ) : (
              
              renderHistoricalData()
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

export default DashboardCharts;

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
  },
  content: {
    padding: 16,
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  chartsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
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
  multigrandeursContainer: {
    padding: 16,
  },
  multigrandeursGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  multigrandeursItem: {
    padding: 16,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    marginBottom: 10,
  },
  multigrandeursLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  multigrandeursValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'red',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 16,
  },
  temperatureContainer: {
    padding: 16,
  },
  temperatureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    gap: 20,
  },
  temperatureCard: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    width: 160,
  },
  thermometerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thermometerStem: {
    width: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderBottomEndRadius: 0,
    borderBottomStartRadius: 0,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  thermometerFill: {
    width: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  thermometerBulb: {
    borderRadius: 50,
    borderWidth: 2,
    marginTop: -2,
  },
  thermometerLabel: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  thermometerValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  thermometerUnit: {
    fontSize: 16,
    marginLeft: 2,
  },
  feedName: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '500',
  },
});