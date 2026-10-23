import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { EnvioCorreo } from '../../../src/application/services/envio-correo';
import { RegistroTicketsService } from '../../../src/application/services/registro-tickets.service';
import type { CatalogoLecturaRepository } from '../../../src/domain/repositories/catalogo-lectura-repository';
import type { RegistroTicketRepository, TicketCreado } from '../../../src/domain/repositories/registro-ticket-repository';
import type { CriterioVecino, Vecino, VecinoRepository } from '../../../src/domain/repositories/vecino-repository';
import { formatearNumero } from '../../../src/domain/ticket/numero-ticket';
import type { TicketRegistrado } from '../../../src/domain/ticket/ticket';
import { correosPendientes, EnviadorEnMemoria, PlantillasEnMemoria, RelojFalso } from '../auth/dobles';

class RegistrosEnMemoria implements RegistroTicketRepository {
  readonly registrados: TicketRegistrado[] = [];

  async registrar(registro: TicketRegistrado): Promise<TicketCreado> {
    this.registrados.push(registro);
    const id = this.registrados.length;
    return { id, numero: formatearNumero(2026, id), creadoEn: registro.historial.creadoEn };
  }
}

class CatalogoFalso implements CatalogoLecturaRepository {
  readonly categoriasActivas = new Set([1]);
  readonly zonas = new Set([1]);

  async categoriaRegistrable(categoriaId: number): Promise<boolean> {
    return this.categoriasActivas.has(categoriaId);
  }

  async zonaExiste(zonaId: number): Promise<boolean> {
    return this.zonas.has(zonaId);
  }
}

// Solo los vecinos activos; el resto (internos, inactivos) no aparece, como en el repositorio real.
class VecinosEnMemoria implements VecinoRepository {
  constructor(readonly activos: Vecino[]) {}

  async obtenerActivo(id: number): Promise<Vecino | null> {
    return this.activos.find((v) => v.id === id) ?? null;
  }

  async buscarActivos(_criterio: CriterioVecino, limite: number): Promise<Vecino[]> {
    return this.activos.slice(0, limite);
  }

  async crear(): Promise<{ id: number }> {
    throw new Error('no se usa en estas pruebas');
  }
}

const VECINO: Vecino = { id: 10, nombre: 'Vecina Ana', email: 'ana@vozmuni.test', telefono: '55550000' };
const SIN_CORREO: Vecino = { id: 11, nombre: 'Vecino Beto', email: null, telefono: '55551111' };

const vecino: UsuarioAutenticado = {
  id: VECINO.id,
  nombre: VECINO.nombre,
  rol: 'vecino',
  dependenciaId: null,
  permisos: { 'tickets.crear': 'propia' },
};
const receptor: UsuarioAutenticado = {
  id: 20,
  nombre: 'Receptor',
  rol: 'receptor',
  dependenciaId: null,
  permisos: { 'tickets.crear': 'a_nombre_de_vecino' },
};

const cuerpo = {
  categoriaId: 1,
  zonaId: 1,
  titulo: '  Bache en la calle ',
  descripcion: 'Hay un bache profundo frente a la escuela',
  direccion: '5a avenida 3-20, zona 1',
};

function crear() {
  const registros = new RegistrosEnMemoria();
  const catalogo = new CatalogoFalso();
  const enviador = new EnviadorEnMemoria();
  const errores: string[] = [];
  const reloj = new RelojFalso(new Date('2026-10-22T18:00:00.000Z'));
  const servicio = new RegistroTicketsService(
    registros,
    catalogo,
    new VecinosEnMemoria([VECINO, SIN_CORREO]),
    new EnvioCorreo(new PlantillasEnMemoriaConQueja(), enviador, (mensaje) => errores.push(mensaje)),
    reloj,
    'http://localhost:5173',
  );
  return { servicio, registros, catalogo, enviador, errores };
}

// Agrega queja_registrada a las plantillas de prueba.
class PlantillasEnMemoriaConQueja extends PlantillasEnMemoria {
  constructor() {
    super();
    this.plantillas.set('queja_registrada', {
      clave: 'queja_registrada',
      asunto: 'Queja {{numero}}',
      cuerpoTexto: '{{nombre}}: "{{titulo}}" {{numero}} {{enlace}}',
      cuerpoHtml: '<a href="{{enlace}}">{{numero}}</a>',
    });
  }
}

describe('RegistroTicketsService.registrar', () => {
  it('el vecino registra para sí con canal portal y registrado_por igual al solicitante', async () => {
    const e = crear();

    const creado = await e.servicio.registrar(vecino, 'propia', cuerpo);

    expect(creado).toEqual({ id: 1, numero: 'Q-2026-000001', estado: 'nueva', creadoEn: '2026-10-22T18:00:00.000Z' });
    expect(e.registros.registrados[0]).toMatchObject({
      datos: { solicitanteId: 10, registradoPor: 10, canal: 'portal', titulo: 'Bache en la calle' },
      historial: { estadoAnterior: null, estadoNuevo: 'nueva', usuarioId: 10 },
    });
  });

  it('el receptor registra a nombre de un vecino con canal ventanilla y registrado_por propio', async () => {
    const e = crear();

    await e.servicio.registrar(receptor, 'a_nombre_de_vecino', { ...cuerpo, solicitanteId: 10, canal: 'ventanilla' });

    expect(e.registros.registrados[0]).toMatchObject({
      datos: { solicitanteId: 10, registradoPor: 20, canal: 'ventanilla' },
      historial: { usuarioId: 20 },
    });
  });

  it.each([
    ['vecino con solicitanteId', vecino, 'propia', { solicitanteId: 10 }],
    ['vecino con canal', vecino, 'propia', { canal: 'portal' }],
    ['receptor sin canal', receptor, 'a_nombre_de_vecino', { solicitanteId: 10 }],
    ['receptor sin solicitanteId', receptor, 'a_nombre_de_vecino', { canal: 'telefono' }],
    ['receptor con canal portal', receptor, 'a_nombre_de_vecino', { solicitanteId: 10, canal: 'portal' }],
  ] as const)('%s → VALIDACION', async (_caso, usuario, alcance, extra) => {
    const e = crear();

    await expect(e.servicio.registrar(usuario, alcance, { ...cuerpo, ...extra })).rejects.toMatchObject({
      codigo: 'VALIDACION',
    });
    expect(e.registros.registrados).toEqual([]);
  });

  it('un solicitante que no es vecino activo → SOLICITANTE_INVALIDO', async () => {
    const e = crear();

    await expect(
      e.servicio.registrar(receptor, 'a_nombre_de_vecino', { ...cuerpo, solicitanteId: 99, canal: 'telefono' }),
    ).rejects.toMatchObject({ codigo: 'SOLICITANTE_INVALIDO' });
  });

  it('categoría no registrable → CATEGORIA_INVALIDA y zona inexistente → ZONA_INVALIDA', async () => {
    const e = crear();

    await expect(e.servicio.registrar(vecino, 'propia', { ...cuerpo, categoriaId: 2 })).rejects.toMatchObject({
      codigo: 'CATEGORIA_INVALIDA',
    });
    await expect(e.servicio.registrar(vecino, 'propia', { ...cuerpo, zonaId: 2 })).rejects.toMatchObject({
      codigo: 'ZONA_INVALIDA',
    });
    expect(e.registros.registrados).toEqual([]);
  });

  it('las reglas del dominio salen como ErrorDeAplicacion con su código', async () => {
    const e = crear();

    await expect(e.servicio.registrar(vecino, 'propia', { ...cuerpo, titulo: 'Hoyo' })).rejects.toMatchObject({
      name: 'ErrorDeAplicacion',
      codigo: 'TITULO_INVALIDO',
    });
  });

  it('un alcance que no registra quejas → PERMISO_DENEGADO', async () => {
    const e = crear();

    await expect(e.servicio.registrar(receptor, 'asignadas', cuerpo)).rejects.toMatchObject({ codigo: 'PERMISO_DENEGADO' });
  });

  it('envía queja_registrada con el número y el enlace de consulta', async () => {
    const e = crear();

    await e.servicio.registrar(vecino, 'propia', cuerpo);
    await correosPendientes();

    expect(e.enviador.enviados).toEqual([
      {
        para: 'ana@vozmuni.test',
        asunto: 'Queja Q-2026-000001',
        texto: 'Vecina Ana: "Bache en la calle" Q-2026-000001 http://localhost:5173/consulta?numero=Q-2026-000001',
        html: '<a href="http://localhost:5173/consulta?numero=Q-2026-000001">Q-2026-000001</a>',
      },
    ]);
  });

  it('un vecino sin correo no recibe nada, y un fallo del envío no cambia el resultado', async () => {
    const sinCorreo = crear();
    await sinCorreo.servicio.registrar(receptor, 'a_nombre_de_vecino', { ...cuerpo, solicitanteId: 11, canal: 'redes' });
    await correosPendientes();
    expect(sinCorreo.enviador.enviados).toEqual([]);

    const fallo = crear();
    fallo.enviador.fallar = true;
    await expect(fallo.servicio.registrar(vecino, 'propia', cuerpo)).resolves.toMatchObject({ numero: 'Q-2026-000001' });
    await correosPendientes();
    expect(fallo.errores).toEqual([expect.stringContaining('queja_registrada')]);
  });
});
