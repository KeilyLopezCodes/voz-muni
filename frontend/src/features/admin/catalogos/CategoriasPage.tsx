import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import {
  type CategoriaAdmin,
  CLAVES_CATALOGOS,
  crearCategoria,
  editarCategoria,
  listarCategorias,
  listarDependencias,
} from '../api/catalogos-admin-api'
import { CLAVES_POLITICAS_SLA } from '../api/politicas-sla-api'
import { codigoDeError, ConfirmarDesactivar, DialogoCatalogo } from './DialogoCatalogo'
import { type Columna, ListaCatalogo } from './ListaCatalogo'

// /admin/categorias (SPEC 40). La categoría define la dependencia que recibe sus quejas (la regla de asignación de
// RF-41). Nace inactiva y se activa con su SLA completo; moverla solo afecta a las quejas que se acepten después.
// ?editar=<id> abre su edición (el enlace que deja DEPENDENCIA_EN_USO).
export function CategoriasPage() {
  const { t } = useTranslation('admin')
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: CLAVES_CATALOGOS.categorias, queryFn: listarCategorias })
  const dependencias = useQuery({ queryKey: CLAVES_CATALOGOS.dependencias, queryFn: listarDependencias })
  const [parametros, setParametros] = useSearchParams()
  const [dialogo, setDialogo] = useState<{ editando: CategoriaAdmin | null } | null>(null)
  const [nombre, setNombre] = useState('')
  const [dependenciaId, setDependenciaId] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [desactivando, setDesactivando] = useState<CategoriaAdmin | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const activas = (dependencias.data ?? []).filter((d) => d.activa)
  const nombreDependencia = (id: number | '') => activas.find((d) => d.id === id)?.nombre ?? ''

  const abrir = (editando: CategoriaAdmin | null) => {
    setNombre(editando?.nombre ?? '')
    setDependenciaId(editando?.dependencia.id ?? '')
    setError(null)
    setDialogo({ editando })
  }

  // El enlace de DEPENDENCIA_EN_USO (/admin/categorias?editar=<id>) abre esa categoría.
  const editar = parametros.get('editar')
  useEffect(() => {
    const categoria = consulta.data?.find((c) => String(c.id) === editar)
    if (categoria) {
      abrir(categoria)
      setParametros({}, { replace: true })
    }
  }, [editar, consulta.data, setParametros])

  const listo = () => {
    void queryClient.invalidateQueries({ queryKey: CLAVES_CATALOGOS.categorias })
    void queryClient.invalidateQueries({ queryKey: CLAVES_CATALOGOS.dependencias })
    void queryClient.invalidateQueries({ queryKey: CLAVES_POLITICAS_SLA.lista })
    setAviso(t('catalogos.guardado'))
  }

  const guardar = useMutation({
    mutationFn: () => {
      const editando = dialogo?.editando
      if (!editando) return crearCategoria(nombre, Number(dependenciaId))
      return editarCategoria(editando.id, {
        nombre,
        ...(dependenciaId !== editando.dependencia.id ? { dependenciaId: Number(dependenciaId) } : {}),
      })
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      setDialogo(null)
      listo()
    },
    onError: (fallo) => setError(codigoDeError(fallo)),
  })
  const cambiarEstado = useMutation({
    mutationFn: ({ id, activa }: { id: number; activa: boolean }) => editarCategoria(id, { activa }),
    onMutate: () => setErrorAccion(null),
    onSuccess: () => {
      setDesactivando(null)
      listo()
    },
    onError: (fallo) => setErrorAccion(codigoDeError(fallo)),
  })

  const editando = dialogo?.editando ?? null
  const mueve = editando !== null && dependenciaId !== '' && dependenciaId !== editando.dependencia.id

  const columnas: Columna<CategoriaAdmin>[] = [
    {
      titulo: t('catalogos.categorias.dependencia'),
      valor: (c) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }} component="span">
          <span>{c.dependencia.nombre}</span>
          {!c.dependencia.activa && <Chip size="small" variant="outlined" label={t('catalogos.categorias.dependenciaInactiva')} />}
        </Stack>
      ),
    },
    {
      titulo: t('catalogos.categorias.sla'),
      valor: (c) =>
        c.slaCompleto ? (
          t('catalogos.categorias.slaCompleto')
        ) : (
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={t('catalogos.categorias.sinSla')}
            component={Link}
            to="/admin/sla"
            clickable
          />
        ),
    },
    {
      titulo: t('catalogos.categorias.columnaCampos'),
      valor: (c) => t('catalogos.categorias.camposExtra', { count: c.camposExtra }),
    },
  ]

  return (
    <>
      <ListaCatalogo
        titulo={t('catalogos.categorias.titulo')}
        descripcion={t('catalogos.categorias.descripcion')}
        textoNuevo={t('catalogos.categorias.nueva')}
        onNuevo={() => abrir(null)}
        consulta={consulta}
        columnas={columnas}
        aviso={aviso}
        onCerrarAviso={() => setAviso(null)}
        acciones={(c) => (
          <>
            <Button size="small" onClick={() => abrir(c)} aria-label={`${t('catalogos.editar')} ${c.nombre}`}>
              {t('catalogos.editar')}
            </Button>
            {c.activa ? (
              <Button size="small" color="error" onClick={() => setDesactivando(c)} aria-label={`${t('catalogos.desactivar')} ${c.nombre}`}>
                {t('catalogos.desactivar')}
              </Button>
            ) : (
              <Button
                size="small"
                onClick={() => cambiarEstado.mutate({ id: c.id, activa: true })}
                aria-label={`${t('catalogos.activar')} ${c.nombre}`}
              >
                {t('catalogos.activar')}
              </Button>
            )}
          </>
        )}
      />

      {errorAccion && !desactivando && (
        <Alert
          severity="error"
          role="alert"
          onClose={() => setErrorAccion(null)}
          sx={{ mt: 2 }}
          action={
            errorAccion === 'SLA_INCOMPLETO' ? (
              <Button component={Link} to="/admin/sla" color="inherit" size="small">
                {t('catalogos.irSla')}
              </Button>
            ) : undefined
          }
        >
          {t(`catalogos.errores.${errorAccion}`)}
        </Alert>
      )}

      <DialogoCatalogo
        abierto={dialogo !== null}
        titulo={t(editando ? 'catalogos.categorias.editarTitulo' : 'catalogos.categorias.nueva')}
        nombre={nombre}
        onNombre={setNombre}
        error={error}
        enviando={guardar.isPending || dependenciaId === ''}
        onCerrar={() => setDialogo(null)}
        onGuardar={() => guardar.mutate()}
      >
        {/* Solo las dependencias activas; la actual de una categoría se muestra aunque esté inactiva. */}
        <TextField
          select
          label={t('catalogos.categorias.dependencia')}
          value={dependenciaId}
          onChange={(evento) => setDependenciaId(Number(evento.target.value))}
          required
          fullWidth
        >
          {editando && !editando.dependencia.activa && (
            <MenuItem value={editando.dependencia.id} disabled>
              {editando.dependencia.nombre} ({t('catalogos.categorias.dependenciaInactiva')})
            </MenuItem>
          )}
          {activas.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.nombre}
            </MenuItem>
          ))}
        </TextField>
        {!editando && <Alert severity="info">{t('catalogos.categorias.nuevaInactiva')}</Alert>}
        {mueve && <Alert severity="warning">{t('catalogos.categorias.avisoMover', { dependencia: nombreDependencia(dependenciaId) })}</Alert>}
      </DialogoCatalogo>

      <ConfirmarDesactivar
        nombre={desactivando?.nombre ?? null}
        enviando={cambiarEstado.isPending}
        error={desactivando ? errorAccion : null}
        onCancelar={() => {
          setDesactivando(null)
          setErrorAccion(null)
        }}
        onConfirmar={() => desactivando && cambiarEstado.mutate({ id: desactivando.id, activa: false })}
      />
    </>
  )
}
