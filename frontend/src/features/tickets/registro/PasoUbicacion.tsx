import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { CLAVES_REGISTRO, type LimitesMunicipio, listarZonas, obtenerLimitesMunicipio } from '../api/registro-api'
import { campoMui } from './campo-mui'
import { dentroDeLimites, enRango, type EstadoRegistro, LIMITES, type Punto, redondearPunto } from './estado-registro'

const MapaUbicacion = lazy(() => import('./MapaUbicacion'))

type AvisoMapa = 'fueraDelMunicipio' | 'sinPermiso' | 'sinGeolocalizacion'

export function PasoUbicacion() {
  const { t } = useTranslation('tickets')
  const {
    control,
    register,
    clearErrors,
    formState: { errors },
  } = useFormContext<EstadoRegistro>()
  const zonas = useQuery({ queryKey: CLAVES_REGISTRO.zonas, queryFn: listarZonas })
  const limites = useQuery({ queryKey: CLAVES_REGISTRO.limites, queryFn: obtenerLimitesMunicipio })
  const [aviso, setAviso] = useState<AvisoMapa | null>(null)

  // Agrupadas por tipo (zona, colonia, aldea) y luego por nombre, como pide Autocomplete con groupBy.
  const opciones = useMemo(
    () =>
      [...(zonas.data ?? [])].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre)),
    [zonas.data],
  )
  const caja: LimitesMunicipio | null = limites.data?.limites ?? null

  return (
    <Stack spacing={2}>
      {zonas.isError && (
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" size="small" onClick={() => void zonas.refetch()}>
              {t('nuevo.acciones.reintentar')}
            </Button>
          }
        >
          {t('nuevo.ubicacion.errorZonas')}
        </Alert>
      )}
      <Controller
        control={control}
        name="zonaId"
        rules={{
          validate: (valor) =>
            (valor !== null && opciones.some((zona) => zona.id === valor)) || t('nuevo.errores.ZONA_INVALIDA'),
        }}
        render={({ field, fieldState: { error } }) => (
          <Autocomplete
            options={opciones}
            loading={zonas.isPending}
            loadingText={t('nuevo.cargando')}
            noOptionsText={t('nuevo.ubicacion.sinZonas')}
            groupBy={(zona) => t(`nuevo.ubicacion.tipos.${zona.tipo}`, { defaultValue: zona.tipo })}
            getOptionLabel={(zona) => zona.nombre}
            isOptionEqualToValue={(opcion, valor) => opcion.id === valor.id}
            value={opciones.find((zona) => zona.id === field.value) ?? null}
            onChange={(_evento, zona) => field.onChange(zona?.id ?? null)}
            onBlur={field.onBlur}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('nuevo.ubicacion.zona')}
                required
                name={field.name}
                inputRef={field.ref}
                error={Boolean(error)}
                helperText={error?.message ?? t('nuevo.ubicacion.zonaAyuda')}
                slotProps={{ ...params.slotProps, formHelperText: { role: error ? 'alert' : undefined } }}
              />
            )}
          />
        )}
      />
      <TextField
        label={t('nuevo.ubicacion.direccion')}
        required
        fullWidth
        multiline
        minRows={2}
        autoComplete="street-address"
        error={Boolean(errors.direccion)}
        helperText={errors.direccion?.message ?? t('nuevo.ubicacion.direccionAyuda')}
        slotProps={{ formHelperText: { role: errors.direccion ? 'alert' : undefined } }}
        {...campoMui(
          register('direccion', {
            validate: (valor) => enRango(valor, LIMITES.direccion) || t('nuevo.errores.DIRECCION_INVALIDA'),
          }),
        )}
      />

      {limites.isPending && <CircularProgress aria-label={t('nuevo.cargando')} />}
      {limites.isError && (
        <Alert severity="info" role="status">
          {t('nuevo.ubicacion.mapaNoDisponible')}
        </Alert>
      )}
      {/* Sin caja configurada no hay mapa ni coordenadas (SPEC 15). */}
      {caja && (
        <Controller
          control={control}
          name="ubicacion"
          rules={{
            validate: (punto) =>
              punto === null || dentroDeLimites(punto, caja) || t('nuevo.errores.UBICACION_FUERA_DEL_MUNICIPIO'),
          }}
          render={({ field, fieldState: { error } }) => {
            const marcar = (punto: Punto) => {
              if (!dentroDeLimites(punto, caja)) {
                setAviso('fueraDelMunicipio')
                return
              }
              setAviso(null)
              clearErrors('ubicacion')
              field.onChange(redondearPunto(punto))
            }

            const usarMiUbicacion = () => {
              if (!('geolocation' in navigator)) {
                setAviso('sinGeolocalizacion')
                return
              }
              navigator.geolocation.getCurrentPosition(
                ({ coords }) => marcar({ lat: coords.latitude, lng: coords.longitude }),
                () => setAviso('sinPermiso'),
                { enableHighAccuracy: true, timeout: 10_000 },
              )
            }

            const mensaje = error?.message ?? (aviso && t(`nuevo.ubicacion.avisos.${aviso}`))

            return (
              <Stack spacing={1}>
                <Typography variant="subtitle2" component="p">
                  {t('nuevo.ubicacion.mapaTitulo')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('nuevo.ubicacion.mapaAyuda')}
                </Typography>
                <Suspense fallback={<CircularProgress aria-label={t('nuevo.cargando')} />}>
                  <MapaUbicacion limites={caja} punto={field.value} onMarcar={marcar} />
                </Suspense>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <Button variant="outlined" size="small" onClick={usarMiUbicacion}>
                    {t('nuevo.ubicacion.usarMiUbicacion')}
                  </Button>
                  {field.value && (
                    <Button
                      size="small"
                      onClick={() => {
                        setAviso(null)
                        field.onChange(null)
                      }}
                    >
                      {t('nuevo.ubicacion.quitar')}
                    </Button>
                  )}
                </Stack>
                {field.value && (
                  <Typography variant="body2" role="status">
                    {t('nuevo.ubicacion.puntoMarcado', { latitud: field.value.lat, longitud: field.value.lng })}
                  </Typography>
                )}
                {mensaje && (
                  <Alert severity="warning" role="alert">
                    {mensaje}
                  </Alert>
                )}
              </Stack>
            )
          }}
        />
      )}
    </Stack>
  )
}
