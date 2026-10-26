import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { useSession } from '../../../shared/auth/session'
import { CLAVES_REPORTES, type FiltrosReportes as Filtros, obtenerResumen, PRIORIDADES, type Prioridad } from '../api/reportes-api'
import { esFechaValida, fechaLocalGuatemala, sumarDias } from '../bitacora/fechas'
import { agruparZonas } from '../componentes/datos-graficas'
import { FiltrosReportes, type OpcionesFiltros } from '../componentes/FiltrosReportes'
import { formatoFecha } from '../componentes/formato'
import { GraficaBarras } from '../componentes/GraficaBarras'
import { TablaIndicadores } from '../componentes/TablaIndicadores'
import { TarjetasIndicadores } from '../componentes/TarjetasIndicadores'

// Copia de la regla del backend (domain/reportes/rango-fechas.ts): por defecto los últimos 30 días.
const DIAS_POR_DEFECTO = 30
// Con el alcance de reportes.ver `dependencia` o `propia` no se elige otra dependencia: solo mostraría ceros.
const ROLES_SIN_SELECTOR_DE_DEPENDENCIA = ['tecnico', 'coordinador']

const idDe = (valor: string | null) => {
  const numero = Number.parseInt(valor ?? '', 10)
  return Number.isInteger(numero) && numero > 0 ? numero : null
}

// Tablero de quejas e indicadores de SLA (RF-38, RF-39, SPEC 43). Los filtros van en la URL
// (?desde=&hasta=&dependenciaId=&categoriaId=&zonaId=&prioridad=), sin escribir los valores por defecto. Las
// opciones de los selectores salen del resumen del mismo rango sin filtros opcionales: solo lo que el usuario
// ya puede ver (decisión al implementar SPEC 43).
export function ReportesPage() {
  const { t } = useTranslation(['reportes', 'tickets'])
  const session = useSession()
  const [parametros, setParametros] = useSearchParams()
  const hoy = fechaLocalGuatemala(new Date())
  const hastaUrl = parametros.get('hasta')
  const desdeUrl = parametros.get('desde')
  const hasta = esFechaValida(hastaUrl) ? hastaUrl : hoy
  const desde = esFechaValida(desdeUrl) ? desdeUrl : sumarDias(hasta, -(DIAS_POR_DEFECTO - 1))
  const prioridadUrl = parametros.get('prioridad')
  const filtros: Filtros = useMemo(
    () => ({
      desde,
      hasta,
      dependenciaId: idDe(parametros.get('dependenciaId')),
      categoriaId: idDe(parametros.get('categoriaId')),
      zonaId: idDe(parametros.get('zonaId')),
      prioridad: (PRIORIDADES as readonly string[]).includes(prioridadUrl ?? '') ? (prioridadUrl as Prioridad) : null,
    }),
    [desde, hasta, parametros, prioridadUrl],
  )
  const soloRango: Filtros = useMemo(
    () => ({ desde, hasta, dependenciaId: null, categoriaId: null, zonaId: null, prioridad: null }),
    [desde, hasta],
  )

  // Sin filtros opcionales, las dos consultas tienen la misma clave y se hace una sola petición.
  const resumen = useQuery({ queryKey: CLAVES_REPORTES.resumen(filtros), queryFn: () => obtenerResumen(filtros) })
  const paraOpciones = useQuery({ queryKey: CLAVES_REPORTES.resumen(soloRango), queryFn: () => obtenerResumen(soloRango) })
  const opciones: OpcionesFiltros = {
    dependencias: (paraOpciones.data?.porDependencia ?? []).flatMap((d) => (d.id === null ? [] : [{ id: d.id, nombre: d.nombre! }])),
    categorias: paraOpciones.data?.porCategoria ?? [],
    zonas: paraOpciones.data?.porZona ?? [],
  }
  const errorRango = resumen.error instanceof ApiError && resumen.error.codigo === 'RANGO_INVALIDO'

  const aplicar = (nuevos: Filtros) => {
    const siguientes = new URLSearchParams()
    if (nuevos.desde) siguientes.set('desde', nuevos.desde)
    if (nuevos.hasta) siguientes.set('hasta', nuevos.hasta)
    if (nuevos.dependenciaId !== null) siguientes.set('dependenciaId', String(nuevos.dependenciaId))
    if (nuevos.categoriaId !== null) siguientes.set('categoriaId', String(nuevos.categoriaId))
    if (nuevos.zonaId !== null) siguientes.set('zonaId', String(nuevos.zonaId))
    if (nuevos.prioridad !== null) siguientes.set('prioridad', nuevos.prioridad)
    setParametros(siguientes)
  }

  const datos = resumen.data
  const etiquetaDependencia = (nombre: string | null) => nombre ?? t('graficas.sinDependencia')

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('titulo')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('descripcion')}
      </Typography>

      <Stack spacing={3}>
        <FiltrosReportes
          key={parametros.toString()}
          valores={filtros}
          opciones={opciones}
          mostrarDependencia={!ROLES_SIN_SELECTOR_DE_DEPENDENCIA.includes(session?.rol ?? '')}
          errorRango={errorRango}
          onAplicar={aplicar}
          onLimpiar={() => setParametros(new URLSearchParams())}
        />

        {resumen.isPending && (
          <Stack spacing={2} aria-busy="true" aria-label={t('cargando')}>
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={240} />
          </Stack>
        )}
        {resumen.isError && !errorRango && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => void resumen.refetch()}>
                {t('reintentar')}
              </Button>
            }
          >
            {t('errorCarga')}
          </Alert>
        )}
        {datos && datos.total === 0 && (
          <Typography color="text.secondary">
            {t('vacio', { desde: formatoFecha(datos.rango.desde), hasta: formatoFecha(datos.rango.hasta) })}
          </Typography>
        )}
        {datos && datos.total > 0 && (
          <>
            <TarjetasIndicadores indicadores={datos.indicadores} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, lg: 6 }}>
                <GraficaBarras
                  titulo={t('graficas.porEstado')}
                  descripcion={t('graficas.descripcion', { grupo: t('graficas.grupos.estado') })}
                  datos={datos.porEstado.map((e) => ({
                    clave: e.estado,
                    etiqueta: t(`tickets:estados.${e.estado}`),
                    cantidad: e.cantidad,
                  }))}
                />
              </Grid>
              <Grid size={{ xs: 12, lg: 6 }}>
                <GraficaBarras
                  titulo={t('graficas.porCategoria')}
                  descripcion={t('graficas.descripcion', { grupo: t('graficas.grupos.categoria') })}
                  datos={datos.porCategoria.map((c) => ({ clave: String(c.id), etiqueta: c.nombre, cantidad: c.cantidad }))}
                />
              </Grid>
              <Grid size={{ xs: 12, lg: 6 }}>
                <GraficaBarras
                  titulo={t('graficas.porDependencia')}
                  descripcion={t('graficas.descripcion', { grupo: t('graficas.grupos.dependencia') })}
                  datos={datos.porDependencia.map((d) => ({
                    clave: String(d.id),
                    etiqueta: etiquetaDependencia(d.nombre),
                    cantidad: d.cantidad,
                  }))}
                />
              </Grid>
              <Grid size={{ xs: 12, lg: 6 }}>
                <GraficaBarras
                  titulo={t('graficas.porZona')}
                  descripcion={t('graficas.descripcion', { grupo: t('graficas.grupos.zona') })}
                  datos={agruparZonas(
                    datos.porZona.map((z) => ({ clave: String(z.id), etiqueta: z.nombre, cantidad: z.cantidad })),
                    t('graficas.otras'),
                  )}
                />
              </Grid>
            </Grid>
            <TablaIndicadores titulo={t('tablas.porDependencia')} filas={datos.indicadoresPorDependencia} />
            <TablaIndicadores titulo={t('tablas.porCategoria')} filas={datos.indicadoresPorCategoria} />
          </>
        )}
      </Stack>
    </>
  )
}
