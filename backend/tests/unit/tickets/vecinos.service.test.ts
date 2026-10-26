import {
  enmascararEmail,
  enmascararTelefono,
  MAX_VECINOS_ENCONTRADOS,
  VecinosService,
} from '../../../src/application/services/vecinos.service';
import type { CriterioVecino, Vecino, VecinoRepository } from '../../../src/domain/repositories/vecino-repository';
import {
  EnviadorEnMemoria,
  PlantillasEnMemoria,
  RelojFalso,
  RestablecimientosEnMemoria,
  SesionesEnMemoria,
  TokensFalsos,
  TransaccionEnMemoria,
  UsuariosAdminEnMemoria,
  UsuariosEnMemoria,
  VecinosEnMemoria,
} from '../auth/dobles';
import { notificadorDePrueba } from '../notificaciones/dobles-correo';

// Registra el criterio y el límite que recibe; devuelve los vecinos que se le dan.
class VecinosFalsos implements VecinoRepository {
  readonly llamadas: { criterio: CriterioVecino; limite: number }[] = [];

  constructor(private readonly resultado: Vecino[]) {}

  async obtenerActivo(): Promise<Vecino | null> {
    return null;
  }

  async buscarActivos(criterio: CriterioVecino, limite: number): Promise<Vecino[]> {
    this.llamadas.push({ criterio, limite });
    return this.resultado.slice(0, limite);
  }

  async crear(): Promise<{ id: number }> {
    throw new Error('no se usa en estas pruebas');
  }
}

// Servicio sobre dobles en memoria; `vecinos` reemplaza al repositorio de búsqueda si se da.
function crearEscenario(vecinosBusqueda?: VecinoRepository) {
  const usuarios = new UsuariosEnMemoria([]);
  const vecinos = new VecinosEnMemoria(usuarios);
  const restablecimientos = new RestablecimientosEnMemoria();
  const enviador = new EnviadorEnMemoria();
  const errores: string[] = [];
  const reloj = new RelojFalso(new Date('2026-10-22T15:00:00.000Z'));
  const servicio = new VecinosService(
    vecinosBusqueda ?? vecinos,
    new TransaccionEnMemoria({
      usuarios,
      usuariosAdmin: new UsuariosAdminEnMemoria(usuarios),
      sesiones: new SesionesEnMemoria(),
      restablecimientos,
      vecinos,
    }),
    notificadorDePrueba(new PlantillasEnMemoria(), enviador, (mensaje) => errores.push(mensaje)),
    new TokensFalsos(),
    reloj,
    'http://localhost:5173',
  );
  return { servicio, usuarios, restablecimientos, enviador, errores };
}

describe('enmascarado', () => {
  it('correo: primer carácter, *** y el dominio', () => {
    expect(enmascararEmail('ana.lopez@municipalidad.gt')).toBe('a***@municipalidad.gt');
  });

  it('teléfono: solo los 4 últimos dígitos', () => {
    expect(enmascararTelefono('55550000')).toBe('****0000');
    expect(enmascararTelefono('+502 5555-1234')).toBe('****1234');
  });
});

describe('VecinosService.buscar', () => {
  const vecino: Vecino = { id: 1, nombre: 'Ana', email: 'ana@vozmuni.test', telefono: '55550000' };

  it('enmascara el correo y el teléfono y nunca devuelve el DPI', async () => {
    const { servicio } = crearEscenario(new VecinosFalsos([{ ...vecino, dpi: '2547123450101' } as Vecino]));

    const { datos } = await servicio.buscar({ email: 'ana@vozmuni.test' });

    expect(datos).toEqual([{ id: 1, nombre: 'Ana', email: 'a***@vozmuni.test', telefono: '****0000' }]);
    expect(JSON.stringify(datos)).not.toContain('2547123450101');
    expect(Object.keys(datos[0])).not.toContain('dpi');
  });

  it('respeta los nulos de contacto', async () => {
    const { servicio } = crearEscenario(new VecinosFalsos([{ ...vecino, email: null, telefono: null }]));

    expect((await servicio.buscar({ telefono: '55550000' })).datos[0]).toMatchObject({ email: null, telefono: null });
  });

  it('pide como máximo 10 resultados', async () => {
    const repo = new VecinosFalsos(Array.from({ length: 15 }, (_, i) => ({ ...vecino, id: i + 1 })));

    const { datos } = await crearEscenario(repo).servicio.buscar({ telefono: '55550000' });

    expect(MAX_VECINOS_ENCONTRADOS).toBe(10);
    expect(datos).toHaveLength(10);
    expect(repo.llamadas[0].limite).toBe(10);
  });

  it('normaliza correo, DPI y teléfono antes de buscar', async () => {
    const repo = new VecinosFalsos([]);
    const { servicio } = crearEscenario(repo);

    await servicio.buscar({ email: 'ANA@VozMuni.test' });
    await servicio.buscar({ dpi: '2547 12345 0101' });
    await servicio.buscar({ telefono: '5555-0000' });

    expect(repo.llamadas.map((l) => l.criterio)).toEqual([
      { email: 'ana@vozmuni.test' },
      { dpi: '2547123450101' },
      { telefono: '55550000' },
    ]);
  });

  it('un DPI o un teléfono inválidos → DPI_INVALIDO y TELEFONO_INVALIDO', async () => {
    const { servicio } = crearEscenario(new VecinosFalsos([]));

    await expect(servicio.buscar({ dpi: '123' })).rejects.toMatchObject({ codigo: 'DPI_INVALIDO' });
    await expect(servicio.buscar({ telefono: '123' })).rejects.toMatchObject({ codigo: 'TELEFONO_INVALIDO' });
  });
});

describe('VecinosService.crear', () => {
  const alta = { nombre: '  María López ', dpi: '2547 12345 0101', email: 'Maria@Correo.GT', telefono: '5555-0000' };

  it('con correo crea el vecino y una invitación de 24 h, y envía invitacion_vecino', async () => {
    const e = crearEscenario();

    const resultado = await e.servicio.crear(alta);

    expect(resultado).toEqual({
      vecino: { id: 1, nombre: 'María López', email: 'm***@correo.gt', telefono: '****0000' },
      invitacionEnviada: true,
    });
    expect(e.usuarios.filas[0]).toMatchObject({
      rol: 'vecino',
      activo: true,
      passwordHash: null,
      dependenciaId: null,
      dpi: '2547123450101',
      email: 'maria@correo.gt',
      telefono: '55550000',
    });
    expect(e.restablecimientos.filas).toEqual([
      expect.objectContaining({ usuarioId: 1, tipo: 'invitacion', expiraEn: new Date('2026-10-23T15:00:00.000Z') }),
    ]);
    expect(e.enviador.enviados).toEqual([
      {
        para: 'maria@correo.gt',
        asunto: 'Portal',
        texto: 'María López: http://localhost:5173/restablecer?token=renovacion-1',
        html: '<a href="http://localhost:5173/restablecer?token=renovacion-1">María López</a>',
      },
    ]);
  });

  it('sin correo no crea el enlace ni envía nada', async () => {
    const e = crearEscenario();

    const resultado = await e.servicio.crear({ ...alta, email: null });

    expect(resultado).toEqual({
      vecino: { id: 1, nombre: 'María López', email: null, telefono: '****0000' },
      invitacionEnviada: false,
    });
    expect(e.restablecimientos.filas).toEqual([]);
    expect(e.enviador.enviados).toEqual([]);
  });

  it('si el envío falla devuelve invitacionEnviada: false y el vecino queda creado', async () => {
    const e = crearEscenario();
    e.enviador.fallar = true;

    const resultado = await e.servicio.crear(alta);

    expect(resultado.invitacionEnviada).toBe(false);
    expect(e.usuarios.filas).toHaveLength(1);
    expect(e.errores).toEqual([expect.stringContaining('invitacion_vecino')]);
    expect(e.errores[0]).not.toContain('renovacion-1');
  });

  it('la respuesta nunca incluye el DPI', async () => {
    const { vecino } = await crearEscenario().servicio.crear(alta);

    expect(JSON.stringify(vecino)).not.toContain('2547123450101');
  });

  it.each([
    [{ email: null, telefono: null }, 'CONTACTO_REQUERIDO'],
    [{ nombre: '   ' }, 'NOMBRE_INVALIDO'],
    [{ telefono: '123' }, 'TELEFONO_INVALIDO'],
    [{ dpi: '' }, 'DPI_INVALIDO'],
  ])('rechaza %o con %s y no crea nada', async (cambios, codigo) => {
    const e = crearEscenario();

    await expect(e.servicio.crear({ ...alta, ...cambios })).rejects.toMatchObject({ name: 'ErrorDeAplicacion', codigo });
    expect(e.usuarios.filas).toEqual([]);
  });

  it('un correo o un DPI repetidos → EMAIL_DUPLICADO y DPI_DUPLICADO', async () => {
    const e = crearEscenario();
    await e.servicio.crear(alta);

    await expect(e.servicio.crear({ ...alta, dpi: '2547123450102' })).rejects.toMatchObject({ codigo: 'EMAIL_DUPLICADO' });
    await expect(e.servicio.crear({ ...alta, email: 'otra@correo.gt' })).rejects.toMatchObject({ codigo: 'DPI_DUPLICADO' });
  });
});
