import type { UseFormRegisterReturn } from 'react-hook-form'

// MUI recibe la ref de React Hook Form en inputRef, no en ref.
export function campoMui({ ref, ...resto }: UseFormRegisterReturn) {
  return { ...resto, inputRef: ref }
}
