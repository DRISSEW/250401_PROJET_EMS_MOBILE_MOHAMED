import { useLocalSearchParams, useRouter } from 'expo-router';
import ChartView from '../components/ChartView';
import { Feed } from '../types';

export default function ChartScreen() {
  const { selectedIds, itemName } = useLocalSearchParams<{ selectedIds: string, itemName: string }>();
  const parsedIds = selectedIds ? JSON.parse(selectedIds) : [];
  const router = useRouter();

  // Create a feed with the actual item name from the dropdown
  const feed: Feed = {
    id: parsedIds.length > 0 ? parsedIds[0] : '1',
    name: itemName || `Feed ${parsedIds.length > 0 ? parsedIds[0] : '1'}`,
    tag: 'test'
  };

  const handleBack = () => {
    router.back();
  };

  return <ChartView feed={feed} onBack={handleBack} />;
} 