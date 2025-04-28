declare module 'react-native-charts-wrapper' {
  import { ViewProps } from 'react-native';

  export interface LineChartProps extends ViewProps {
    data: any;
    chartConfig?: any;
    markers?: any;
    bezier?: boolean;
    withDots?: boolean;
    withInnerLines?: boolean;
    withOuterLines?: boolean;
    withVerticalLines?: boolean;
    withHorizontalLines?: boolean;
    withVerticalLabels?: boolean;
    withHorizontalLabels?: boolean;
    withShadow?: boolean;
    withScrollableDot?: boolean;
    decorator?: () => React.ReactNode;
    onDataPointClick?: (data: { value: number; dataset: any; getColor: (opacity: number) => string }) => void;
  }

  export class LineChart extends React.Component<LineChartProps> {}
} 