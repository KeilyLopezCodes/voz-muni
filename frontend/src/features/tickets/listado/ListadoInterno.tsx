import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Pagination from '@mui/material/Pagination'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import type { Rol } from '../../../shared/auth/roles'
import { useSession } from '../../../shared/auth/session'
import { CLAVES_REGISTRO, listarCategorias } from '../api/registro-api'
import { CLAVES_TICKETS, listarTickets, resumenTicketsCon, TAMANO_PAGINA } from '../api/tickets-api'
import { CLAVES_TRASLADOS, listarDependencias } from '../api/traslados-api'
import { hoyGuatemala } from '../registro/validar-datos-extra'
import {
  aFiltrosConteo,
  aFiltrosListado,
  conCambio,
  type CriteriosListadoInterno,
  criteriosPorDefecto,
  escribirCriterios,
  leerCriterios,
} from './criterios-url'
import { FiltrosListado } from './FiltrosListado'
import { TablaQuejas } from './TablaQuejas'
import { TarjetaQueja } from './TarjetaQueja'

// Los roles cuyo alcance de tickets.ver es `todas` (matriz de SPEC 08): solo a ellos les sirve filtrar por
// dependencia. Es solo interfaz: el backend aplica el alcance a cada filtro (SPEC 45).
const ROLES_CON_TODAS: readonly Rol[] = ['supervisor', 'administrador']

// Listado de consulta de las quejas para los internos (SPEC 45). Los filtros viven en la URL; cada queja abre
// /tickets/:id, donde están las acciones.
export function ListadoInterno() {
  const { t } = useTranslation('tickets')
  const theme = useTheme()
  const escritorio = useMediaQuery(theme.breakpoints.up('md'))
  const session = useSession()
  const [parametros, setParametros] = useSearchParams()
  const hoy = useMemo(() => hoyGuatemala(), [])
  const criterios = useMemo(() => leerCriterios(parametros, hoy), [parametros, hoy])
  const ahora = new Date()

  const filtrosListado = useMemo(() => aFiltrosListado(criterios), [criterios])
  const filtrosConteo = useMemo(() => aFiltrosConteo(criterios), [criterios])
  const listado = useQuery({
    queryKey: CLAVES_TICKETS.listadoCon(filtrosListado),
    queryFn: () => listarTickets(filtrosListado),
  })
  const resumen = useQuery({
    queryKey: CLAVES_TICKETS.resumenConFiltros(filtrosConteo),
    queryFn: () => resumenTicketsCon(filtrosConteo),
  })
  const mostrarDependencia = session !== null && ROLES_CON_TODAS.includes(session.rol)
  const dependencias = useQuery({
    queryKey: CLAVES_TRASLADOS.dependencias,
    queryFn: listarDependencias,
    enabled: mostrarDependencia,
  })
  const categorias = useQuery({ queryKey: CLAVES_REGISTRO.categorias, queryFn: listarCategorias })

  // Cambiar un filtro vuelve a la página 1 y agrega una entrada al historial; la búsqueda la reemplaza.
  const cambiar = useCallback(
    (cambio: Partial<CriteriosListadoInterno>, reemplazar = false) => {
      setParametros((actuales) => escribirCriterios(conCambio(leerCriterios(actuales, hoy), cambio), hoy), {
        replace: reemplazar,
      })
    },
    [setParametros, hoy],
  )
  const limpiar = useCallback(() => {
    setParametros(escribirCriterios(criteriosPorDefecto(hoy), hoy))
  }, [setParametros, hoy])

  const paginas = listado.data ? Math.ceil(listado.data.total / TAMANO_PAGINA) : 0
  const vacio = listado.isSuccess && listado.data.total === 0
  const sinFiltros = escribirCriterios(criterios, hoy).toString() === ''
  const tickets = listado.data?.datos ?? []

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('listadoInterno.titulo')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('listadoInterno.descripcion')}
      </Typography>

      <Stack spacing={2}>
        <FiltrosListado
          criterios={criterios}
          hoy={hoy}
          resumen={resumen.data ?? null}
          dependencias={dependencias.data ?? []}
          categorias={(categorias.data ?? []).map(({ id, nombre }) => ({ id, nombre }))}
          mostrarDependencia={mostrarDependencia}
          onCambiar={cambiar}
          onLimpiar={limpiar}
        />

        {listado.isPending && (
          <Stack spacing={1} aria-busy="true" aria-label={t('listadoInterno.cargando')}>
            {[0, 1, 2].map((fila) => (
              <Skeleton key={fila} variant="rounded" height={escritorio ? 40 : 110} />
            ))}
          </Stack>
        )}
        {listado.isError && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => void listado.refetch()}>
                {t('listadoInterno.reintentar')}
              </Button>
            }
          >
            {t('listadoInterno.errorCarga')}
          </Alert>
        )}
        {vacio && sinFiltros && <Alert severity="info">{t('listadoInterno.vacioTotal')}</Alert>}
        {vacio && !sinFiltros && (
          <Alert
            severity="info"
            action={
              <Button color="inherit" size="small" onClick={limpiar}>
                {t('listadoInterno.filtros.limpiar')}
              </Button>
            }
          >
            {t('listadoInterno.vacioFiltros')}
          </Alert>
        )}

        {listado.isSuccess && listado.data.total > 0 && (
          <Typography variant="body2" color="text.secondary" role="status">
            {t('listadoInterno.total', { count: listado.data.total })}
          </Typography>
        )}
        {tickets.length > 0 &&
          (escritorio ? (
            <TablaQuejas tickets={tickets} ahora={ahora} />
          ) : (
            tickets.map((ticket) => <TarjetaQueja key={ticket.id} ticket={ticket} ahora={ahora} />)
          ))}

        {paginas > 1 && (
          <Pagination
            count={paginas}
            page={criterios.pagina}
            onChange={(_evento, pagina) => cambiar({ pagina })}
            aria-label={t('listadoInterno.paginacion')}
          />
        )}
      </Stack>
    </>
  )
}
