import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { campoMui } from './campo-mui'
import { enRango, type EstadoRegistro, largo, LIMITES } from './estado-registro'

export function PasoDescripcion() {
  const { t } = useTranslation('tickets')
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<EstadoRegistro>()

  const contador = (campo: 'titulo' | 'descripcion') =>
    t('nuevo.descripcion.contador', { actual: largo(watch(campo)), max: LIMITES[campo].max })

  return (
    <Stack spacing={2}>
      <TextField
        label={t('nuevo.descripcion.titulo')}
        required
        fullWidth
        error={Boolean(errors.titulo)}
        helperText={errors.titulo?.message ?? `${t('nuevo.descripcion.tituloAyuda')} · ${contador('titulo')}`}
        slotProps={{ formHelperText: { role: errors.titulo ? 'alert' : undefined } }}
        {...campoMui(
          register('titulo', {
            validate: (valor) => enRango(valor, LIMITES.titulo) || t('nuevo.errores.TITULO_INVALIDO'),
          }),
        )}
      />
      <TextField
        label={t('nuevo.descripcion.descripcion')}
        required
        fullWidth
        multiline
        minRows={4}
        error={Boolean(errors.descripcion)}
        helperText={
          errors.descripcion?.message ?? `${t('nuevo.descripcion.descripcionAyuda')} · ${contador('descripcion')}`
        }
        slotProps={{ formHelperText: { role: errors.descripcion ? 'alert' : undefined } }}
        {...campoMui(
          register('descripcion', {
            validate: (valor) => enRango(valor, LIMITES.descripcion) || t('nuevo.errores.DESCRIPCION_INVALIDA'),
          }),
        )}
      />
    </Stack>
  )
}
