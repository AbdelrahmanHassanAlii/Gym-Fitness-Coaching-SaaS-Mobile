import type { FieldValues, UseFormProps } from 'react-hook-form';

export { Controller, useController, useForm, useFormContext } from 'react-hook-form';
export type {
  Control,
  FieldErrors,
  FieldPath,
  FieldValues,
  SubmitHandler,
  UseControllerProps,
  UseFormProps,
  UseFormReturn,
} from 'react-hook-form';

export type BackendFieldErrorMap = Record<string, string[]>;

export function createFormConfig<TValues extends FieldValues>(
  config: UseFormProps<TValues>,
): UseFormProps<TValues> {
  return {
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    ...config,
  };
}

export function mapBackendFieldErrors(details: unknown): BackendFieldErrorMap {
  if (!details || typeof details !== 'object') return {};

  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') return {};

  const result: BackendFieldErrorMap = {};
  for (const [field, value] of Object.entries(fieldErrors)) {
    if (typeof value === 'string') {
      result[field] = [value];
    } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      result[field] = value;
    }
  }

  return result;
}
