import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { PATRON_NUMERO } from '../api/consulta-publica-api'

export interface DatosConsulta {
  numero: string
  contacto: string
}

interface FormularioConsultaProps {
  numeroInicial: string
  onConsultar: (datos: DatosConsulta) => Promise<void>
}

// El número y el correo o teléfono del solicitante (SPEC 37). Valida en el cliente solo el formato del número y que
// haya contacto: si el contacto coincide lo decide el backend.
export function FormularioConsulta({ numeroInicial, onConsultar }: FormularioConsultaProps) {
  const { t } = useTranslation('tickets')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosConsulta>({ defaultValues: { numero: numeroInicial, contacto: '' } })
  const { ref: refNumero, ...numero } = register('numero', {
    setValueAs: (valor: string) => valor.trim().toUpperCase(),
    validate: (valor) => PATRON_NUMERO.test(valor) || t('consulta.validacion.numero'),
  })
  const { ref: refContacto, ...contacto } = register('contacto', {
    validate: (valor) => valor.trim() !== '' || t('consulta.validacion.contacto'),
  })

  const enviar = handleSubmit((datos) => onConsultar({ numero: datos.numero, contacto: datos.contacto.trim() }))

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={enviar}>
      <TextField
        label={t('consulta.campos.numero')}
        error={Boolean(errors.numero)}
        helperText={errors.numero?.message ?? t('consulta.campos.numeroAyuda')}
        slotProps={{ formHelperText: { role: errors.numero ? 'alert' : undefined } }}
        autoComplete="off"
        required
        fullWidth
        inputRef={refNumero}
        {...numero}
      />
      <TextField
        label={t('consulta.campos.contacto')}
        error={Boolean(errors.contacto)}
        helperText={errors.contacto?.message}
        slotProps={{ formHelperText: { role: errors.contacto ? 'alert' : undefined } }}
        autoComplete="email"
        required
        fullWidth
        inputRef={refContacto}
        {...contacto}
      />
      <Button type="submit" variant="contained" disabled={isSubmitting}>
        {isSubmitting ? t('consulta.consultando') : t('consulta.consultar')}
      </Button>
    </Stack>
  )
}
