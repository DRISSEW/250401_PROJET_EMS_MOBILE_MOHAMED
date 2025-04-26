import { Slot } from 'expo-router';
// import { useAuth } from '../context/AuthContext';
import { Redirect } from 'expo-router';

export default function AuthLayout() {
  // // // // const { user } = useAuth();

  // If user is logged in, redirect to home
  // // // if (user) {
    // // // return <Redirect href="/(app)/home" />;
  // }

  return <Slot />;
} 