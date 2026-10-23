import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { type KeyboardEvent, useState } from 'react'
import { Controller, useForm, useFormContext, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import { validarDpi, validarEmail, validarTelefono } from '../../../shared/validacion/datos-personales'
import {
  buscarVecinos,
  CANALES_INTERNOS,
  type CriterioVecino,
  crearVecino,
  type VecinoEncontrado,
} from '../api/registro-api'
import { campoMui } from './campo-mui'
import { type Aviso, destinoDeError } from './errores-registro'
import type { EstadoRegistro } from './estado-registro'

// Paso previo de la ventanilla (receptor y supervisor): buscar o dar de alta al vecino (SPEC 12 y 13)
// y elegir el canal. El vecino que registra para sí nunca ve este paso.

type TipoBusqueda = 'telefono' | 'email' | 'dpi'

const VALIDAR_BUSQUEDA: Record<TipoBusqueda, (valor: string) => string | null> = {
  telefono: (valor) => (valor.trim() === '' ? 'TELEFONO_INVALIDO' : validarTelefono(valor)),
  email: validarEmail,
  dpi: validarDpi,
}

// Mismo rango que domain/usuarios/vecino.ts (SPEC 13): de 1 a 150 caracteres recortado.
const NOMBRE_MAX = 150

interface AltaVecino {
  nombre: string
  dpi: string
  email: string
  telefono: string
}

const ALTA_INICIAL: AltaVecino = { nombre: '', dpi: '', email: '', telefono: '' }

// Errores del alta que se muestran en su campo; los demás, como aviso.
const CAMPO_DEL_ALTA: Partial<Record<string, keyof AltaVecino>> = {
  NOMBRE_INVALIDO: 'nombre',
  DPI_INVALIDO: 'dpi',
  EMAIL_INVALIDO: 'email',
  TELEFONO_INVALIDO: 'telefono',
}

// Enter en la búsqueda o el alta no debe enviar el formulario principal (que avanzaría de paso).
const sinEnviar = (accion: () => void) => (evento: KeyboardEvent) => {
  if (evento.key === 'Enter' && !(evento.target instanceof HTMLTextAreaElement)) {
    evento.preventDefault()
    accion()
  }
}

export function PasoSolicitante() {
  const { t } = useTranslation('tickets')
  const { control, setValue, clearErrors } = useFormContext<EstadoRegistro>()
  const solicitante = useWatch({ control, name: 'solicitante' })

  const [tipo, setTipo] = useState<TipoBusqueda>('telefono')
  const [valor, setValor] = useState('')
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<VecinoEncontrado[] | null>(null)
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [sinInvitacion, setSinInvitacion] = useState(false)

  const alta = useForm<AltaVecino>({ defaultValues: ALTA_INICIAL })

  const regla = (validar: (texto: string) => string | null) => (texto: string) => {
    const codigo = validar(texto)
    return codigo === null ? true : t(`nuevo.solicitante.errores.${codigo}`)
  }

  const elegir = (vecino: VecinoEncontrado, recienCreado = false) => {
    setValue('solicitante', vecino)
    clearErrors('solicitante')
    if (!recienCreado) {
      setSinInvitacion(false)
    }
  }

  const buscar = async () => {
    const codigo = VALIDAR_BUSQUEDA[tipo](valor)
    if (codigo) {
      setErrorBusqueda(t(`nuevo.solicitante.errores.${codigo}`))
      return
    }
    setErrorBusqueda(null)
    setAviso(null)
    setBuscando(true)
    try {
      const criterio = { [tipo]: valor.trim() } as CriterioVecino
      setResultados((await buscarVecinos(criterio)).datos)
    } catch (error) {
      setResultados(null)
      setAviso(destinoDeError(error instanceof ApiError ? error.codigo : '').aviso ?? 'generico')
    } finally {
      setBuscando(false)
    }
  }

  const registrarVecino = alta.handleSubmit(async (datos) => {
    setAviso(null)
    const email = datos.email.trim()
    const telefono = datos.telefono.trim()
    try {
      const creado = await crearVecino({
        nombre: datos.nombre.trim(),
        dpi: datos.dpi,
        ...(email === '' ? {} : { email }),
        ...(telefono === '' ? {} : { telefono }),
      })
      elegir(creado.vecino, true)
      // Con correo, el vecino recibe una invitación para definir su contraseña (SPEC 13).
      setSinInvitacion(email !== '' && !creado.invitacionEnviada)
      setMostrarAlta(false)
      setResultados(null)
      alta.reset(ALTA_INICIAL)
    } catch (error) {
      const codigo = error instanceof ApiError ? error.codigo : ''
      const campo = CAMPO_DEL_ALTA[codigo]
      if (campo) {
        alta.setError(campo, { message: t(`nuevo.solicitante.errores.${codigo}`) }, { shouldFocus: true })
      } else {
        setAviso(destinoDeError(codigo).aviso ?? 'generico')
      }
    }
  })

  const contacto = (vecino: VecinoEncontrado) =>
    [vecino.email, vecino.telefono].filter(Boolean).join(' · ') || t('nuevo.solicitante.sinContacto')

  return (
    <Stack spacing={3}>
      {aviso && (
        <Alert severity="error" role="alert">
          {t(`nuevo.avisos.${aviso}`)}
        </Alert>
      )}

      <Controller
        control={control}
        name="solicitante"
        rules={{ validate: (vecino) => vecino !== null || t('nuevo.solicitante.requerido') }}
        render={({ fieldState: { error } }) =>
          solicitante ? (
            <Paper variant="outlined" component="section" aria-label={t('nuevo.solicitante.elegido')} sx={{ p: 2 }}>
              <Typography variant="subtitle2" component="h3">
                {t('nuevo.solicitante.elegido')}
              </Typography>
              <Typography>{solicitante.nombre}</Typography>
              <Typography variant="body2" color="text.secondary">
                {contacto(solicitante)}
              </Typography>
              <Button size="small" sx={{ mt: 1 }} onClick={() => setValue('solicitante', null)}>
                {t('nuevo.solicitante.cambiar')}
              </Button>
            </Paper>
          ) : (
            <Stack spacing={2}>
              <Stack spacing={2} onKeyDown={sinEnviar(() => void buscar())}>
                <TextField
                  select
                  label={t('nuevo.solicitante.buscarPor')}
                  value={tipo}
                  onChange={(evento) => {
                    setTipo(evento.target.value as TipoBusqueda)
                    setErrorBusqueda(null)
                  }}
                  fullWidth
                >
                  {(['telefono', 'email', 'dpi'] as const).map((opcion) => (
                    <MenuItem key={opcion} value={opcion}>
                      {t(`nuevo.solicitante.tipos.${opcion}`)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label={t(`nuevo.solicitante.tipos.${tipo}`)}
                  value={valor}
                  onChange={(evento) => setValor(evento.target.value)}
                  type={tipo === 'email' ? 'email' : tipo === 'telefono' ? 'tel' : 'text'}
                  autoComplete="off"
                  fullWidth
                  error={Boolean(errorBusqueda)}
                  helperText={errorBusqueda ?? t(`nuevo.solicitante.ayuda.${tipo}`)}
                  slotProps={{
                    htmlInput: { inputMode: tipo === 'email' ? 'email' : tipo === 'telefono' ? 'tel' : 'numeric' },
                    formHelperText: { role: errorBusqueda ? 'alert' : undefined },
                  }}
                />
                <Button variant="outlined" onClick={() => void buscar()} disabled={buscando}>
                  {t(buscando ? 'nuevo.solicitante.buscando' : 'nuevo.solicitante.buscar')}
                </Button>
              </Stack>

              {resultados && resultados.length === 0 && (
                <Alert severity="info" role="status">
                  {t('nuevo.solicitante.sinResultados')}
                </Alert>
              )}
              {resultados && resultados.length > 0 && (
                <List aria-label={t('nuevo.solicitante.resultados')} disablePadding>
                  {resultados.map((vecino) => (
                    <ListItem
                      key={vecino.id}
                      divider
                      secondaryAction={
                        <Button
                          size="small"
                          onClick={() => elegir(vecino)}
                          aria-label={t('nuevo.solicitante.elegirA', { nombre: vecino.nombre })}
                        >
                          {t('nuevo.solicitante.elegir')}
                        </Button>
                      }
                    >
                      <ListItemText primary={vecino.nombre} secondary={contacto(vecino)} sx={{ pr: 8 }} />
                    </ListItem>
                  ))}
                </List>
              )}

              {mostrarAlta ? (
                <Paper variant="outlined" component="section" aria-label={t('nuevo.solicitante.alta.titulo')} sx={{ p: 2 }}>
                  <Stack spacing={2} onKeyDown={sinEnviar(() => void registrarVecino())}>
                    <Typography variant="subtitle1" component="h3">
                      {t('nuevo.solicitante.alta.titulo')}
                    </Typography>
                    <TextField
                      label={t('nuevo.solicitante.alta.nombre')}
                      required
                      fullWidth
                      autoComplete="off"
                      error={Boolean(alta.formState.errors.nombre)}
                      helperText={alta.formState.errors.nombre?.message}
                      slotProps={{ formHelperText: { role: alta.formState.errors.nombre ? 'alert' : undefined } }}
                      {...campoMui(
                        alta.register('nombre', {
                          validate: regla((texto) => {
                            const largo = [...texto.trim()].length
                            return largo < 1 || largo > NOMBRE_MAX ? 'NOMBRE_INVALIDO' : null
                          }),
                        }),
                      )}
                    />
                    <TextField
                      label={t('nuevo.solicitante.alta.dpi')}
                      required
                      fullWidth
                      autoComplete="off"
                      error={Boolean(alta.formState.errors.dpi)}
                      helperText={alta.formState.errors.dpi?.message ?? t('nuevo.solicitante.ayuda.dpi')}
                      slotProps={{
                        htmlInput: { inputMode: 'numeric' },
                        formHelperText: { role: alta.formState.errors.dpi ? 'alert' : undefined },
                      }}
                      {...campoMui(alta.register('dpi', { validate: regla(validarDpi) }))}
                    />
                    <TextField
                      label={t('nuevo.solicitante.alta.email')}
                      type="email"
                      fullWidth
                      autoComplete="off"
                      error={Boolean(alta.formState.errors.email)}
                      helperText={alta.formState.errors.email?.message ?? t('nuevo.solicitante.alta.contactoAyuda')}
                      slotProps={{ formHelperText: { role: alta.formState.errors.email ? 'alert' : undefined } }}
                      {...campoMui(
                        alta.register('email', {
                          validate: (texto, datos) => {
                            if (texto.trim() === '') {
                              return datos.telefono.trim() !== '' || t('nuevo.solicitante.errores.SIN_CONTACTO')
                            }
                            return regla(validarEmail)(texto)
                          },
                        }),
                      )}
                    />
                    <TextField
                      label={t('nuevo.solicitante.alta.telefono')}
                      type="tel"
                      fullWidth
                      autoComplete="off"
                      error={Boolean(alta.formState.errors.telefono)}
                      helperText={alta.formState.errors.telefono?.message ?? t('nuevo.solicitante.ayuda.telefono')}
                      slotProps={{ formHelperText: { role: alta.formState.errors.telefono ? 'alert' : undefined } }}
                      {...campoMui(alta.register('telefono', { validate: regla(validarTelefono) }))}
                    />
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                      <Button
                        variant="contained"
                        onClick={() => void registrarVecino()}
                        disabled={alta.formState.isSubmitting}
                      >
                        {t(
                          alta.formState.isSubmitting
                            ? 'nuevo.solicitante.alta.registrando'
                            : 'nuevo.solicitante.alta.registrar',
                        )}
                      </Button>
                      <Button onClick={() => setMostrarAlta(false)}>{t('nuevo.solicitante.alta.cancelar')}</Button>
                    </Stack>
                  </Stack>
                </Paper>
              ) : (
                <Button onClick={() => setMostrarAlta(true)} sx={{ alignSelf: 'flex-start' }}>
                  {t('nuevo.solicitante.alta.abrir')}
                </Button>
              )}

              {error && (
                <FormHelperText error role="alert">
                  {error.message}
                </FormHelperText>
              )}
            </Stack>
          )
        }
      />

      {sinInvitacion && (
        <Alert severity="warning" role="alert">
          {t('nuevo.solicitante.sinInvitacion')}
        </Alert>
      )}

      <Controller
        control={control}
        name="canal"
        rules={{ validate: (canal) => canal !== null || t('nuevo.solicitante.canalRequerido') }}
        render={({ field, fieldState: { error } }) => (
          <FormControl required error={Boolean(error)} disabled={!solicitante}>
            <FormLabel id="canal-etiqueta">{t('nuevo.solicitante.canal')}</FormLabel>
            <RadioGroup
              aria-labelledby="canal-etiqueta"
              name={field.name}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            >
              {CANALES_INTERNOS.map((canal) => (
                <FormControlLabel
                  key={canal}
                  value={canal}
                  control={<Radio />}
                  label={t(`nuevo.solicitante.canales.${canal}`)}
                />
              ))}
            </RadioGroup>
            {error && <FormHelperText role="alert">{error.message}</FormHelperText>}
          </FormControl>
        )}
      />
    </Stack>
  )
}
