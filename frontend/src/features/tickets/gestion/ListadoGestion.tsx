import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useSession } from '../../../shared/auth/session'
import { CLAVES_GESTION, type FiltrosGestion as Filtros, listarGestion, opcionesGestion, TAMANO_PAGINA_GESTION } from '../api/gestion-api'
import { FiltrosGestion } from './FiltrosGestion'
import { busquedaValida, filtrosAUrl, filtrosDesdeUrl, hayFiltros } from './filtros-url'
import { TablaGestion } from './TablaGestion'

// Listado general de quejas para los internos (SPEC 45): las de su alcance de tickets.ver, con los filtros y la
// página en la URL. El orden lo decide el backend; las acciones siguen en las bandejas y en el detalle.
export function ListadoGestion() {
  const { t } = useTranslation('tickets')
  const session = useSession()
  const [parametros, setParametros] = useSearchParams()
  const clave = parametros.toString()
  const filtros = useMemo(() => filtrosDesdeUrl(new URLSearchParams(clave)), [clave])

  const listado = useQuery({
    queryKey: CLAVES_GESTION.listadoCon(filtros),
    queryFn: () => listarGestion(filtros),
    placeholderData: keepPreviousData,
  })
  const opciones = useQuery({ queryKey: CLAVES_GESTION.opciones, queryFn: opcionesGestion, staleTime: 5 * 60_000 })
  const paginas = listado.data ? Math.ceil(listado.data.total / TAMANO_PAGINA_GESTION) : 0

  // Cualquier filtro vuelve a la página 1. Cada cambio agrega una entrada al historial; la búsqueda la reemplaza
  // para que escribir no llene "Atrás" de pasos intermedios.
  const navegar = useCallback(
    (cambios: Partial<Filtros>, reemplazar = false) => {
      setParametros((actuales) => filtrosAUrl({ ...filtrosDesdeUrl(actuales), pagina: 1, ...cambios }), { replace: reemplazar })
    },
    [setParametros],
  )
  const buscar = useCallback((texto: string) => navegar({ q: busquedaValida(texto) }, true), [navegar])

  const vacio = listado.isSuccess && listado.data.total === 0
  const conFiltros = hayFiltros(filtros)

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('listado.titulo')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('gestion.descripcion')}
      </Typography>

      <Stack spacing={2}>
        <FiltrosGestion
          filtros={filtros}
          opciones={opciones.data}
          mostrarTecnico={session?.rol !== 'tecnico'}
          q={parametros.get('q') ?? ''}
          onCambiar={navegar}
          onBuscar={buscar}
        />

        {listado.isPending && <CircularProgress aria-label={t('gestion.cargando')} />}
        {listado.isError && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => void listado.refetch()}>
                {t('gestion.reintentar')}
              </Button>
            }
          >
            {t('gestion.errorCarga')}
          </Alert>
        )}
        {vacio && !conFiltros && <Alert severity="info">{t('gestion.vacioAlcance')}</Alert>}
        {vacio && conFiltros && (
          <Alert
            severity="info"
            action={
              <Button color="inherit" size="small" onClick={() => setParametros(new URLSearchParams())}>
                {t('gestion.limpiarFiltros')}
              </Button>
            }
          >
            {t('gestion.vacioFiltros')}
          </Alert>
        )}

        {listado.isSuccess && listado.data.total > 0 && (
          <>
            <Typography variant="body2" color="text.secondary" role="status">
              {t('gestion.total', { count: listado.data.total })}
            </Typography>
            <TablaGestion tickets={listado.data.datos} />
          </>
        )}

        {paginas > 1 && (
          <Pagination
            count={paginas}
            page={Math.min(filtros.pagina, paginas)}
            onChange={(_evento, nueva) => navegar({ ...filtros, pagina: nueva })}
            aria-label={t('gestion.paginacion')}
            sx={{ alignSelf: 'center' }}
          />
        )}
      </Stack>
    </>
  )
}
