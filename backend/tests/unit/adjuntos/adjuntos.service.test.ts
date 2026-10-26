import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { AdjuntosService } from '../../../src/application/services/adjuntos.service';
import type { AlmacenArchivos } from '../../../src/domain/adjuntos/almacen-archivos';
import type { OrigenAdjunto } from '../../../src/domain/adjuntos/reglas-adjuntos';
import type { FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import type {
  AdjuntoLeido,
  AdjuntoRepository,
  NuevoAdjunto,
  TicketParaAdjuntar,
} from '../../../src/domain/repositories/adjunto-repository';
import type { TicketLecturaRepository } from '../../../src/domain/repositories/ticket-lectura-repository';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { ZipInspectorDocx } from '../../../src/infrastructure/storage/zip-inspector-docx';
import { RelojFalso, TransaccionEnMemoria } from '../auth/dobles';

const AHORA = new Date('2026-10-23T15:00:00.000Z');
const fixture = (nombre: string) => readFileSync(path.join(__dirname, '../../fixtures/archivos', nombre));
const pdf = (nombre = 'documento.pdf') => ({ nombre, contenido: fixture('documento.pdf') });

const VECINO: UsuarioAutenticado = {
  id: 7,
  nombre: 'Ana López',
  rol: 'vecino',
  dependenciaId: null,
  permisos: { 'tickets.ver': 'propia', 'comentarios.publico': 'si' },
};
const TECNICO: UsuarioAutenticado = {
  id: 30,
  nombre: 'Luis Técnico',
  rol: 'tecnico',
  dependenciaId: 4,
  permisos: { 'tickets.ver': 'asignadas', 'comentarios.publico': 'si', 'comentarios.interno': 'si' },
};
const SIN_NOTAS: UsuarioAutenticado = { ...TECNICO, id: 31, permisos: { 'tickets.ver': 'todas', 'comentarios.publico': 'si' } };

class AlmacenEnMemoria implements AlmacenArchivos {
  readonly archivos = new Map<string, Buffer>();
  fallarBorrado = false;
  private siguiente = 0;

  async guardar(contenido: Buffer): Promise<string> {
    const ruta = `aa/aa${String(this.siguiente++).padStart(34, '0')}`;
    this.archivos.set(ruta, contenido);
    return ruta;
  }

  async leer(ruta: string): Promise<NodeJS.ReadableStream> {
    return Readable.from([this.archivos.get(ruta)!]);
  }

  async borrar(ruta: string): Promise<void> {
    if (this.fallarBorrado) throw new Error('EBUSY');
    this.archivos.delete(ruta);
  }
}

class AdjuntosEnMemoria implements AdjuntoRepository {
  readonly filas: (NuevoAdjunto & { id: number })[] = [];
  readonly tickets = new Map<number, TicketParaAdjuntar>();
  fallarEnCrear: number | null = null; // número de inserción que falla

  agregarTicket(id: number, estado: EstadoTicket, registradoPor: number | null = 7): void {
    this.tickets.set(id, { id, estado, solicitanteId: 7, registradoPor, dependenciaId: 4 });
  }

  async ticketParaAdjuntar(id: number, filtro: FiltroTickets): Promise<TicketParaAdjuntar | null> {
    return filtro === null ? null : (this.tickets.get(id) ?? null);
  }

  async contarPorOrigen(ticketId: number, origen: OrigenAdjunto): Promise<number> {
    return this.filas.filter((f) => f.ticketId === ticketId && f.origen === origen).length;
  }

  async crear(adjunto: NuevoAdjunto): Promise<number> {
    if (this.fallarEnCrear !== null && this.filas.length + 1 === this.fallarEnCrear) {
      throw new Error('fallo de la base');
    }
    const id = this.filas.length + 1;
    this.filas.push({ ...adjunto, id });
    return id;
  }

  async listar(ticketId: number, incluirInternos: boolean): Promise<AdjuntoLeido[]> {
    return this.filas.filter((f) => f.ticketId === ticketId && (incluirInternos || !f.interno)).map((f) => this.leido(f));
  }

  async obtener(ticketId: number, adjuntoId: number, incluirInternos: boolean): Promise<AdjuntoLeido | null> {
    return (await this.listar(ticketId, incluirInternos)).find((a) => a.id === adjuntoId) ?? null;
  }

  async obtenerDelAutor(ticketId: number, adjuntoId: number, autorId: number): Promise<AdjuntoLeido | null> {
    const fila = this.filas.find((f) => f.ticketId === ticketId && f.id === adjuntoId && f.subidoPor === autorId);
    return fila ? this.leido(fila) : null;
  }

  async borrar(id: number): Promise<void> {
    this.filas.splice(
      this.filas.findIndex((f) => f.id === id),
      1,
    );
  }

  private leido(f: NuevoAdjunto & { id: number }): AdjuntoLeido {
    return {
      id: f.id,
      nombre: f.nombre,
      ruta: f.ruta,
      mime: f.mime,
      tamanoBytes: f.tamanoBytes,
      interno: f.interno,
      origen: f.origen,
      subidoPor: { id: f.subidoPor, nombre: `Usuario ${f.subidoPor}`, rol: 'tecnico' },
      creadoEn: f.creadoEn,
    };
  }
}

function armar() {
  const adjuntos = new AdjuntosEnMemoria();
  const almacen = new AlmacenEnMemoria();
  const reloj = new RelojFalso(AHORA);
  const errores: string[] = [];
  const lectura = { obtener: async (id: number) => (adjuntos.tickets.has(id) ? ({ id } as never) : null) };
  const servicio = new AdjuntosService(
    new TransaccionEnMemoria({ adjuntos }),
    lectura as unknown as TicketLecturaRepository,
    almacen,
    new ZipInspectorDocx(),
    reloj,
    (mensaje) => errores.push(mensaje),
  );
  return { adjuntos, almacen, reloj, errores, servicio };
}

function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => {
      throw new Error('se esperaba una excepción');
    },
    (error: unknown) => error,
  );
}

describe('AdjuntosService', () => {
  it('el vecino sube a su queja nueva: origen registro, públicos, con el nombre limpio y el MIME por contenido', async () => {
    const { adjuntos, almacen, servicio } = armar();
    adjuntos.agregarTicket(1, 'nueva');

    const respuesta = await servicio.subir(VECINO, 1, [pdf('../x/factura.pdf'), { nombre: 'foto.jpg', contenido: fixture('foto.jpg') }], undefined);

    expect(respuesta.adjuntos).toHaveLength(2);
    expect(respuesta.adjuntos[0]).toEqual({
      id: 1,
      nombre: 'factura.pdf',
      mime: 'application/pdf',
      tamanoBytes: fixture('documento.pdf').length,
      interno: false,
      origen: 'registro',
      subidoPor: { id: 7, nombre: 'Usuario 7', rol: 'tecnico' },
      creadoEn: AHORA.toISOString(),
      borrable: true,
    });
    expect(respuesta.adjuntos[1].mime).toBe('image/jpeg');
    expect(almacen.archivos.size).toBe(2);
    expect(JSON.stringify(respuesta)).not.toContain('aa/aa');
  });

  it('el vecino fuera de nueva → ADJUNTOS_CERRADOS', async () => {
    const { adjuntos, servicio } = armar();
    adjuntos.agregarTicket(1, 'en_proceso');

    expect(await capturar(servicio.subir(VECINO, 1, [pdf()], undefined))).toMatchObject({ codigo: 'ADJUNTOS_CERRADOS' });
  });

  it('un registro con interno → VALIDACION', async () => {
    const { adjuntos, servicio } = armar();
    adjuntos.agregarTicket(1, 'nueva');

    expect(await capturar(servicio.subir(VECINO, 1, [pdf()], true))).toMatchObject({ codigo: 'VALIDACION' });
  });

  it('el cupo de 5 se cuenta por origen: 3 de registro y luego 3 más → LIMITE_ADJUNTOS sin guardar nada', async () => {
    const { adjuntos, almacen, servicio } = armar();
    adjuntos.agregarTicket(1, 'nueva');
    await servicio.subir(VECINO, 1, [pdf(), pdf(), pdf()], undefined);

    expect(await capturar(servicio.subir(VECINO, 1, [pdf(), pdf(), pdf()], undefined))).toMatchObject({
      codigo: 'LIMITE_ADJUNTOS',
      detalles: [{ campo: 'restantes', problema: '2' }],
    });
    expect(almacen.archivos.size).toBe(3);
    // El técnico, en la atención, tiene su propio cupo de 5.
    adjuntos.tickets.get(1)!.estado = 'en_proceso';
    expect((await servicio.subir(TECNICO, 1, [pdf(), pdf(), pdf(), pdf(), pdf()], true)).adjuntos).toHaveLength(5);
  });

  it('un archivo inválido → ADJUNTO_INVALIDO y no se guarda ninguno', async () => {
    const { adjuntos, almacen, servicio } = armar();
    adjuntos.agregarTicket(1, 'nueva');

    const error = await capturar(
      servicio.subir(VECINO, 1, [pdf(), { nombre: 'falso.pdf', contenido: fixture('programa.exe') }], undefined),
    );

    expect(error).toMatchObject({ codigo: 'ADJUNTO_INVALIDO', detalles: [{ campo: 'falso.pdf', problema: 'CONTENIDO_NO_COINCIDE' }] });
    expect(almacen.archivos.size).toBe(0);
    expect(adjuntos.filas).toEqual([]);
  });

  it('si la base falla después de escribir archivos, los borra', async () => {
    const { adjuntos, almacen, servicio } = armar();
    adjuntos.agregarTicket(1, 'nueva');
    adjuntos.fallarEnCrear = 2;

    expect(await capturar(servicio.subir(VECINO, 1, [pdf(), pdf()], undefined))).toMatchObject({ message: 'fallo de la base' });
    expect(almacen.archivos.size).toBe(0);
  });

  it('en la atención: interno sin comentarios.interno → PERMISO_DENEGADO; público sí', async () => {
    const { adjuntos, servicio } = armar();
    adjuntos.agregarTicket(1, 'en_proceso');

    expect(await capturar(servicio.subir(SIN_NOTAS, 1, [pdf()], true))).toMatchObject({ codigo: 'PERMISO_DENEGADO' });
    expect((await servicio.subir(SIN_NOTAS, 1, [pdf()], false)).adjuntos[0]).toMatchObject({ origen: 'atencion', interno: false });
  });

  it('en una queja cerrada, un público → QUEJA_FINALIZADA y un interno sí', async () => {
    const { adjuntos, servicio } = armar();
    adjuntos.agregarTicket(1, 'cerrada');

    expect(await capturar(servicio.subir(TECNICO, 1, [pdf()], false))).toMatchObject({ codigo: 'QUEJA_FINALIZADA' });
    expect((await servicio.subir(TECNICO, 1, [pdf()], true)).adjuntos[0].interno).toBe(true);
  });

  it('listar y descargar sin comentarios.interno ocultan los internos', async () => {
    const { adjuntos, servicio } = armar();
    adjuntos.agregarTicket(1, 'en_proceso');
    await servicio.subir(TECNICO, 1, [pdf('publico.pdf')], false);
    await servicio.subir(TECNICO, 1, [pdf('interno.pdf')], true);

    expect((await servicio.listar(VECINO, 1)).datos.map((a) => a.nombre)).toEqual(['publico.pdf']);
    expect((await servicio.listar(TECNICO, 1)).datos.map((a) => a.nombre)).toEqual(['publico.pdf', 'interno.pdf']);
    expect(await capturar(servicio.descargar(VECINO, 1, 2))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
    expect(await servicio.descargar(VECINO, 1, 1)).toMatchObject({ nombre: 'publico.pdf', mime: 'application/pdf' });
  });

  it('borrar: solo el autor, durante 5 minutos; borra la fila y el archivo', async () => {
    const { adjuntos, almacen, reloj, servicio } = armar();
    adjuntos.agregarTicket(1, 'en_proceso');
    await servicio.subir(TECNICO, 1, [pdf(), pdf()], true);

    expect(await capturar(servicio.borrar(SIN_NOTAS, 1, 1))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
    reloj.actual = new Date(AHORA.getTime() + 2 * 60_000);
    await servicio.borrar(TECNICO, 1, 1);
    expect(adjuntos.filas.map((f) => f.id)).toEqual([2]);
    expect(almacen.archivos.size).toBe(1);

    reloj.actual = new Date(AHORA.getTime() + 5 * 60_000 + 1);
    expect(await capturar(servicio.borrar(TECNICO, 1, 2))).toMatchObject({ codigo: 'EDICION_VENCIDA' });
  });

  it('si borrar el archivo falla, queda en el log y la fila igual se borra', async () => {
    const { adjuntos, almacen, errores, servicio } = armar();
    adjuntos.agregarTicket(1, 'en_proceso');
    await servicio.subir(TECNICO, 1, [pdf()], true);
    almacen.fallarBorrado = true;

    await servicio.borrar(TECNICO, 1, 1);

    expect(adjuntos.filas).toEqual([]);
    expect(errores).toEqual([expect.stringContaining('No se pudo borrar el archivo de adjunto')]);
  });
});
