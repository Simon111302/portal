import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from './LoginScreen';
import StudentPortalScreen from './StudentPortalScreen';

const Stack = createNativeStackNavigator();

const App = () => {
  const [initialRoute, setInitialRoute] = useState<'Login' | 'StudentPortal'>('Login');

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const data = await AsyncStorage.getItem('studentData');
      if (data) {
        setInitialRoute('StudentPortal');
      }
    } catch (e) {
      console.log('Check login error:', e);
    }
  };

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="StudentPortal" component={StudentPortalScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;

