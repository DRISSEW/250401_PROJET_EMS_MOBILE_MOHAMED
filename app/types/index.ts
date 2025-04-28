export interface Feed {
    id: string;
    name: string;
    tag:string;
    value?: string | number;
  }
  
  export interface ChartData {
    labels: string[];
    values: number[];
  }
  
  export interface Stats {
    mean: number;
    min: number;
    max: number;
    total: number;
  }
  
  export interface TimeRange {
    hours: number;
    label: string;
    icon: string;
  }
  
  export interface ChartViewProps {
    feed: Feed;
    onBack: () => void;
  } 