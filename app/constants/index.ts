import { TimeRange } from '../types';
import { FontAwesome } from '@expo/vector-icons';

export const TIME_RANGES: TimeRange[] = [
  { hours: 6, label: '6H', icon: 'clock-o' },
  { hours: 12, label: '12H', icon: 'clock-o' },
  { hours: 24, label: '24H', icon: 'clock-o' },
  { hours: 24 * 7, label: '1W', icon: 'calendar-o' },
  { hours: 24 * 20, label: '1M', icon: 'calendar-o' },
  { hours: 24*30 * 12.2, label: '1Y', icon: 'calendar-o' },
];

export const CHART_CONFIG = {
  backgroundColor: '#ffffff',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  decimalPlaces: 2,
  color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  style: {
    borderRadius: 16,
  },
  propsForDots: {
    r: '6',
    strokeWidth: '2',
    stroke: '#0a84ff',
  },
};

export const SCREEN_WIDTH = 400;