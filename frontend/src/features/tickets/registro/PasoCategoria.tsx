import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { CLAVES_REGISTRO, listarCategorias } from '../api/registro-api'
import { CampoExtraInput } from './campos-extra/CampoExtraInput'
import type { EstadoRegistro } from './estado-registro'
import { hoyGuatemala, ordenarCampos } from './validar-datos-extra'

export function PasoCategoria() {
  const { t } = useTranslation('tickets')
  const { control, setValue, clearErrors } = useFormContext<EstadoRegistro>()
  const categorias = useQuery({ queryKey: CLAVES_REGISTRO.categorias, queryFn: listarCategorias })
  const categoriaId = useWatch({ control, name: 'categoriaId' })
  const hoy = useMemo(() => hoyGuatemala(), [])

  const lista = categorias.data ?? []
  const elegida = lista.find((categoria) => categoria.id === categoriaId)

  return (
    <Stack spacing={3}>
      {categorias.isPending && <CircularProgress aria-label={t('nuevo.cargando')} />}
      {categorias.isError && (
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" size="small" onClick={() => void categorias.refetch()}>
              {t('nuevo.acciones.reintentar')}
            </Button>
          }
        >
          {t('nuevo.categoria.errorCarga')}
        </Alert>
      )}
      {categorias.isSuccess && lista.length === 0 && (
        <Alert severity="warning" role="alert">
          {t('nuevo.categoria.sinCategorias')}
        </Alert>
      )}

      {/* Siempre montado: sin categorías que elegir, "Siguiente" sigue bloqueado. */}
      <Controller
        control={control}
        name="categoriaId"
        rules={{
          validate: (valor) =>
            (valor !== null && lista.some((categoria) => categoria.id === valor)) || t('nuevo.categoria.requerida'),
        }}
        render={({ field, fieldState: { error } }) =>
          lista.length === 0 ? (
            <></>
          ) : (
            <FormControl required error={Boolean(error)}>
              <FormLabel id="categoria-etiqueta">{t('nuevo.categoria.etiqueta')}</FormLabel>
              <RadioGroup
                aria-labelledby="categoria-etiqueta"
                name={field.name}
                value={field.value === null ? '' : String(field.value)}
                onChange={(evento) => {
                  field.onChange(Number(evento.target.value))
                  // Los campos adicionales son de cada categoría: cambiarla los vacía.
                  setValue('datosExtra', {})
                  clearErrors('datosExtra')
                }}
                onBlur={field.onBlur}
                ref={field.ref}
              >
                {lista.map((categoria) => (
                  <FormControlLabel
                    key={categoria.id}
                    value={String(categoria.id)}
                    control={<Radio />}
                    label={categoria.nombre}
                  />
                ))}
              </RadioGroup>
              {error && <FormHelperText role="alert">{error.message}</FormHelperText>}
            </FormControl>
          )
        }
      />

      {elegida && elegida.camposExtra.length > 0 && (
        <Stack spacing={2} component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
          <FormLabel component="legend">{t('nuevo.categoria.camposAdicionales')}</FormLabel>
          {ordenarCampos(elegida.camposExtra).map((campo) => (
            <CampoExtraInput key={`${elegida.id}-${campo.clave}`} campo={campo} hoy={hoy} />
          ))}
        </Stack>
      )}
    </Stack>
  )
}
