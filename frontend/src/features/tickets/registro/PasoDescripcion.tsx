import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { type ChangeEvent, useRef, useState } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ACEPTA, MAX_ARCHIVOS, problemaArchivo, tamanoLegible } from '../adjuntos/validar-archivos'
import { campoMui } from './campo-mui'
import { enRango, type EstadoRegistro, largo, LIMITES } from './estado-registro'

export function PasoDescripcion() {
  const { t } = useTranslation('tickets')
  const {
    control,
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
      <Controller
        control={control}
        name="archivos"
        render={({ field }) => <SelectorArchivos archivos={field.value} onCambiar={field.onChange} />}
      />
    </Stack>
  )
}

// Hasta 5 archivos (SPEC 24). Aquí solo se miran la extensión y el tamaño; el backend valida por contenido al subir.
function SelectorArchivos({ archivos, onCambiar }: { archivos: File[]; onCambiar: (archivos: File[]) => void }) {
  const { t, i18n } = useTranslation('tickets')
  const entrada = useRef<HTMLInputElement>(null)
  const [errores, setErrores] = useState<string[]>([])

  const agregar = (evento: ChangeEvent<HTMLInputElement>) => {
    const nuevos = Array.from(evento.target.files ?? [])
    evento.target.value = ''
    const problemas = nuevos.flatMap((nuevo) => {
      const problema = problemaArchivo(nuevo)
      return problema ? [t(`adjuntos.problemas.${problema}`, { nombre: nuevo.name })] : []
    })
    if (archivos.length + nuevos.length > MAX_ARCHIVOS) {
      problemas.push(t('nuevo.archivos.maximo'))
    }
    setErrores(problemas)
    if (problemas.length === 0) {
      onCambiar([...archivos, ...nuevos])
    }
  }

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2" component="p">
        {t('nuevo.archivos.titulo')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('nuevo.archivos.ayuda')}
      </Typography>
      {errores.map((error) => (
        <Alert key={error} severity="error" role="alert">
          {error}
        </Alert>
      ))}
      {archivos.length > 0 && (
        <List dense disablePadding aria-label={t('nuevo.archivos.titulo')}>
          {archivos.map((elegido, indice) => (
            <ListItem
              key={`${elegido.name}-${indice}`}
              disableGutters
              secondaryAction={
                <Button
                  size="small"
                  onClick={() => onCambiar(archivos.filter((_, i) => i !== indice))}
                  aria-label={t('nuevo.archivos.quitarArchivo', { nombre: elegido.name })}
                >
                  {t('nuevo.archivos.quitar')}
                </Button>
              }
              sx={{ pr: 10 }}
            >
              <ListItemText
                primary={elegido.name}
                secondary={tamanoLegible(elegido.size, i18n.language)}
                slotProps={{ primary: { sx: { overflowWrap: 'anywhere' } } }}
              />
            </ListItem>
          ))}
        </List>
      )}
      <input
        ref={entrada}
        type="file"
        multiple
        accept={ACEPTA}
        hidden
        onChange={agregar}
        aria-label={t('nuevo.archivos.agregar')}
        data-testid="entrada-archivos-queja"
      />
      <Button
        variant="outlined"
        onClick={() => entrada.current?.click()}
        disabled={archivos.length >= MAX_ARCHIVOS}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('nuevo.archivos.agregar')}
      </Button>
    </Stack>
  )
}
