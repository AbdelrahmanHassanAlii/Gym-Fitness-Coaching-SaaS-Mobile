import * as SecureStore from 'expo-secure-store';

export const sensitiveStorageKeys = {
  nativeRefreshToken: 'hassan.mobile.secure.auth.native-refresh-token',
} as const;

export type SensitiveStorageKey =
  (typeof sensitiveStorageKeys)[keyof typeof sensitiveStorageKeys];

export type SecureStorageOperation = 'read' | 'write' | 'delete';

export class SecureStorageError extends Error {
  readonly operation: SecureStorageOperation;
  readonly key: SensitiveStorageKey;
  override readonly cause?: unknown;

  constructor(operation: SecureStorageOperation, key: SensitiveStorageKey, cause: unknown) {
    super(`Secure storage ${operation} failed.`);
    this.name = 'SecureStorageError';
    this.operation = operation;
    this.key = key;
    this.cause = cause;
  }
}

export interface SensitiveValueStore {
  read(key: SensitiveStorageKey): Promise<string | null>;
  write(key: SensitiveStorageKey, value: string): Promise<void>;
  delete(key: SensitiveStorageKey): Promise<void>;
}

export const secureStorage: SensitiveValueStore = {
  async read(key) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      throw new SecureStorageError('read', key, error);
    }
  },

  async write(key, value) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      throw new SecureStorageError('write', key, error);
    }
  },

  async delete(key) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      throw new SecureStorageError('delete', key, error);
    }
  },
};
