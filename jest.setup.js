/* global jest */

require('@testing-library/react-native/matchers');

const { notifyManager } = require('@tanstack/react-query');

notifyManager.setScheduler((callback) => queueMicrotask(callback));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
