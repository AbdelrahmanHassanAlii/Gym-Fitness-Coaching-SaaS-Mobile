import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import App from '../App';

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));

describe('App bootstrap screen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('renders the integrated foundation with accessible language, appearance, and theme controls', async () => {
    const screen = await render(<App />);

    expect(
      screen.getByRole('header', {
        name: 'Hassan Gym & Fitness Coaching',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Mobile app foundation - light')).toBeTruthy();
    expect(screen.getByText('Environment: local')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'system' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'default' })).toBeTruthy();
    expect(screen.getByText('Success')).toBeTruthy();
    expect(screen.getByText('Warning')).toBeTruthy();
    expect(screen.getByText('Danger')).toBeTruthy();
  });

  it('keeps language switching independent from theme controls', async () => {
    const screen = await render(<App />);

    fireEvent.press(screen.getByRole('button', { name: 'العربية' }));

    await waitFor(() => {
      expect(
        screen.getByRole('header', {
          name: 'حسن للتدريب الرياضي واللياقة',
        }),
      ).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'default' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'system' })).toBeTruthy();
  });

  it('supports English and Arabic across light and dark appearance choices', async () => {
    const screen = await render(<App />);

    expect(screen.getByText('Mobile app foundation - light')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'dark' }));
    await waitFor(() => {
      expect(screen.getByText('Mobile app foundation - dark')).toBeTruthy();
    });

    fireEvent.press(screen.getByRole('button', { name: 'العربية' }));

    await waitFor(() => {
      expect(screen.getByText('أساس تطبيق الهاتف - dark')).toBeTruthy();
    });

    fireEvent.press(screen.getByRole('button', { name: 'light' }));
    await waitFor(() => {
      expect(screen.getByText('أساس تطبيق الهاتف - light')).toBeTruthy();
    });

    fireEvent.press(screen.getByRole('button', { name: 'English' }));

    await waitFor(() => {
      expect(screen.getByText('Mobile app foundation - light')).toBeTruthy();
    });
  });
});
