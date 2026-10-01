import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

import App from '../App';

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

describe('App bootstrap screen', () => {
  it('renders the existing foundation copy with an accessibility header', async () => {
    const screen = await render(<App />);

    expect(
      screen.getByRole('header', {
        name: 'Hassan Gym & Fitness Coaching',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Mobile app foundation')).toBeTruthy();
  });
});
