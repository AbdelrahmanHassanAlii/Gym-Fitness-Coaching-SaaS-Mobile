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
export type PreservedBackendValidationDetails = unknown;

export function createFormConfig<TValues extends FieldValues>(
  config: UseFormProps<TValues>,
): UseFormProps<TValues> {
  return {
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    ...config,
  };
}

export function preserveBackendValidationDetails(
  details: unknown,
): PreservedBackendValidationDetails {
  return details ?? null;
}
