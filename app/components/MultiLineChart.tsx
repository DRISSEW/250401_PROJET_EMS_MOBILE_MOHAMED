import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useTheme } from '../context/ThemeContext';

// Get initial dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH * 2; // Make chart wider for scrolling
const CHART_HEIGHT = 300; // Increased height for better x-axis visibility

interface ChartDataPoint {
  timestamp: number;
  value: number;
}

interface MultiLineChartProps {
  data: { [key: string]: ChartDataPoint[] };
  items: Array<{ id: string; name: string }>;
  dashboardName: string;
  colors: string[];
  selectedRange: { hours: number; label: string };
}

const MultiLineChart: React.FC<MultiLineChartProps> = React.memo(({
  data,
  items,
  dashboardName,
  colors,
  selectedRange
}) => {
  const { colors: themeColors } = useTheme();
  const [dimensions, setDimensions] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });

  // Handle orientation changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions({
        width: window.width,
        height: window.height
      });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Format timestamp for x-axis labels with interval
  const formatXAxisLabel = useCallback((timestamp: number) => {
    const date = new Date(timestamp * 1000);
    
    if (selectedRange.hours <= 24) {
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (selectedRange.hours <= 24 * 7) {
      return `${date.getHours().toString().padStart(2, '0')}:00`;
    } else if (selectedRange.hours <= 24 * 30) {
      return `${date.getDate()}/${date.getMonth() + 1}`;
    } else {
      return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()];
    }
  }, [selectedRange.hours]);

  // Get interval for the selected range
  const getIntervalForRange = useCallback(() => {
    if (selectedRange.hours <= 24) {
      return 20; // 30 min intervals for day view
    } else if (selectedRange.hours <= 24 * 7) {
      return 60; // 12h intervals for week view
    } else if (selectedRange.hours <= 24 * 30) {
      return 24; // Daily intervals for month view
    } else {
      return 30; // Monthly intervals for year view
    }
  }, [selectedRange.hours]);

  // Get labels at intervals
  const getLabelsAtIntervals = useCallback((timestamps: number[]) => {
    const interval = getIntervalForRange();
    return timestamps.map((timestamp, index) => 
      index % interval === 0 ? formatXAxisLabel(timestamp) : ''
    );
  }, [formatXAxisLabel, getIntervalForRange]);

  // Prepare data for the chart
  const chartData = useMemo(() => {
    const firstItemData = items[0]?.id ? (data[items[0].id] || []) : [];
    const timestamps = firstItemData.map(point => point.timestamp);
    const labels = getLabelsAtIntervals(timestamps);
    
    const datasets = items.map((item, index) => ({
      data: (data[item.id] || []).map(point => point.value),
      color: (opacity = 1) => colors[index % colors.length],
      strokeWidth: 2,
    }));

    return { labels, datasets };
  }, [data, items, colors, getLabelsAtIntervals]);

  // Configure chart settings
  const chartConfig = useMemo(() => ({
    backgroundColor: themeColors.surface,
    backgroundGradientFrom: themeColors.surface,
    backgroundGradientTo: themeColors.surface,
    decimalPlaces: 1,
    color: (opacity = 1) => themeColors.text,
    labelColor: (opacity = 1) => themeColors.text,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: themeColors.primary,
    },
    propsForLabels: {
      fontSize: 12, // Increased font size for better visibility
      rotation: -45,
    },
  }), [themeColors]);

  const chartTitle = useMemo(() => 
    dashboardName === 'Multipuissance' ? 'Power Consumption (W)' : 'Current Measurement (A)'
  , [dashboardName]);

  return (
    <View style={styles.chartWrapper}>
      <View style={[styles.lineChartCard, { 
        backgroundColor: themeColors.surface,
        width: dimensions.width - 32, // Account for padding
      }]}>
        <Text style={[styles.title, { color: themeColors.text }]}>
          {chartTitle}
        </Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.chartContainer}>
            <LineChart
              data={chartData}
              width={CHART_WIDTH}
              height={CHART_HEIGHT}
              chartConfig={chartConfig}
              style={styles.chart}
              withDots={false}
              withInnerLines={true}
              withOuterLines={true}
              withVerticalLines={false}
              withHorizontalLines={false}
              withVerticalLabels={true}
              withHorizontalLabels={true}
              withShadow={false}
              decorator={() => null}
            />
          </View>
        </ScrollView>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  chartWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  lineChartCard: {
    marginVertical: 12,
    padding: 15,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    height: CHART_HEIGHT + 80, // Increased padding for better x-axis visibility
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  scrollContent: {
    paddingRight: 16,
  },
  chartContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
});

export default MultiLineChart; 