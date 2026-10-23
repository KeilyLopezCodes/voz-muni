import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import MenuItem from '@mui/material/MenuItem'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import TextField from '@mui/material/TextField'
import { useId } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { CampoExtra, ValorExtra } from '../../api/registro-api'
import type { EstadoRegistro } from '../estado-registro'
import { validarCampoExtra } from '../validar-datos-extra'

// Hasta 5 opciones se muestran como radios; con más, como lista desplegable.
export const MAX_OPCIONES_RADIO = 5

interface CampoExtraInputProps {
  campo: CampoExtra
  hoy: string // 'AAAA-MM-DD' en America/Guatemala
}

// Un input por tipo de campo adicional (SPEC 14). Etiqueta y ayuda son datos del administrador.
export function CampoExtraInput({ campo, hoy }: CampoExtraInputProps) {
  const { t } = useTranslation('tickets')
  const { control } = useFormContext<EstadoRegistro>()
  const id = useId()

  const mensaje = (problema: string) => {
    const limites =
      campo.tipo === 'texto' || campo.tipo === 'numero' || campo.tipo === 'fecha'
        ? { min: campo.min, max: campo.max }
        : {}
    return t(`nuevo.camposExtra.errores.${problema}`, limites)
  }

  return (
    <Controller
      control={control}
      name={`datosExtra.${campo.clave}`}
      defaultValue={campo.tipo === 'si_no' ? (undefined as unknown as ValorExtra) : ''}
      rules={{
        validate: (valor) => {
          const problema = validarCampoExtra(campo, valor, hoy)
          return problema === null ? true : mensaje(problema)
        },
      }}
      render={({ field, fieldState: { error } }) => {
        const ayuda = error?.message ?? campo.ayuda
        const alerta = { role: error ? 'alert' : undefined }

        switch (campo.tipo) {
          case 'texto': {
            const largo = [...String(field.value ?? '').trim()].length
            return (
              <TextField
                label={campo.etiqueta}
                required={campo.requerido}
                fullWidth
                name={field.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                error={Boolean(error)}
                helperText={[ayuda, t('nuevo.descripcion.contador', { actual: largo, max: campo.max })]
                  .filter(Boolean)
                  .join(' · ')}
                slotProps={{ htmlInput: { maxLength: campo.max }, formHelperText: alerta }}
              />
            )
          }
          case 'numero':
            return (
              <TextField
                label={campo.etiqueta}
                required={campo.requerido}
                fullWidth
                name={field.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                error={Boolean(error)}
                helperText={ayuda}
                slotProps={{ htmlInput: { inputMode: campo.entero ? 'numeric' : 'decimal' }, formHelperText: alerta }}
              />
            )
          case 'fecha': {
            const maximo = campo.noFutura && (campo.max === undefined || hoy < campo.max) ? hoy : campo.max
            return (
              <TextField
                type="date"
                label={campo.etiqueta}
                required={campo.requerido}
                fullWidth
                name={field.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                error={Boolean(error)}
                helperText={ayuda}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: campo.min, max: maximo },
                  formHelperText: alerta,
                }}
              />
            )
          }
          case 'seleccion':
            if (campo.opciones.length > MAX_OPCIONES_RADIO) {
              return (
                <TextField
                  select
                  label={campo.etiqueta}
                  required={campo.requerido}
                  fullWidth
                  name={field.name}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  inputRef={field.ref}
                  error={Boolean(error)}
                  helperText={ayuda}
                  slotProps={{ formHelperText: alerta }}
                >
                  {!campo.requerido && <MenuItem value="">{t('nuevo.camposExtra.ninguna')}</MenuItem>}
                  {campo.opciones.map((opcion) => (
                    <MenuItem key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </MenuItem>
                  ))}
                </TextField>
              )
            }
            return (
              <FormControl required={campo.requerido} error={Boolean(error)} fullWidth>
                <FormLabel id={`${id}-etiqueta`}>{campo.etiqueta}</FormLabel>
                <RadioGroup
                  aria-labelledby={`${id}-etiqueta`}
                  name={field.name}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                >
                  {campo.opciones.map((opcion) => (
                    <FormControlLabel key={opcion.valor} value={opcion.valor} control={<Radio />} label={opcion.etiqueta} />
                  ))}
                </RadioGroup>
                {ayuda && <FormHelperText {...alerta}>{ayuda}</FormHelperText>}
              </FormControl>
            )
          case 'si_no':
            return (
              <FormControl required={campo.requerido} error={Boolean(error)} fullWidth>
                <FormLabel id={`${id}-etiqueta`}>{campo.etiqueta}</FormLabel>
                <RadioGroup
                  row
                  aria-labelledby={`${id}-etiqueta`}
                  name={field.name}
                  value={typeof field.value === 'boolean' ? String(field.value) : ''}
                  onChange={(evento) => field.onChange(evento.target.value === 'true')}
                  onBlur={field.onBlur}
                  ref={field.ref}
                >
                  <FormControlLabel value="true" control={<Radio />} label={t('nuevo.camposExtra.si')} />
                  <FormControlLabel value="false" control={<Radio />} label={t('nuevo.camposExtra.no')} />
                </RadioGroup>
                {ayuda && <FormHelperText {...alerta}>{ayuda}</FormHelperText>}
              </FormControl>
            )
        }
      }}
    />
  )
}
