import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { publicClientConfig } from '@/config/publicConfig';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hassan Gym & Fitness Coaching</Text>
      <Text style={styles.subtitle}>Mobile app foundation</Text>
      <Text style={styles.environment}>
        Environment: {publicClientConfig.appEnvironment}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  environment: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
