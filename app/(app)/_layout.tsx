import { Slot } from 'expo-router';
// import { useAuth } from '../context/AuthContext';
import { Redirect } from 'expo-router';

export default function AppLayout() {
  // // // // const { user } = useAuth();

  // If user is not logged in, redirect to login
  // // if (!user) {
    // // // return <Redirect href="/(auth)/login" />;
  // }

  return <Slot />;
} 