import { DespachoCorreosService, TAMANO_LOTE_CORREOS } from '../../../src/application/services/despacho-correos.service';
import type { ReposTransaccionales, Transaccion } from '../../../src/domain/repositories/transaccion';
import { EnviadorEnMemoria } from '../auth/dobles';
import { CorreosEnMemoria } from './dobles-correo';

const AHORA = new Date('2026-11-02T15:00:00.000Z');
const minutos = (n: number) => new Date(AHORA.getTime() + n * 60_000);

function montar() {
  const correos = new CorreosEnMemoria();
  const enviador = new EnviadorEnMemoria();
  const logs: string[] = [];
  let transacciones = 0;
  const transaccion: Transaccion = {
    ejecutar: (trabajo) => {
      transacciones++;
      return trabajo({ correosSalientes: correos } as unknown as ReposTransaccionales);
    },
  };
  const despacho = new DespachoCorreosService(transaccion, enviador, (m) => logs.push(m));
  return { correos, enviador, logs, despacho, transacciones: () => transacciones };
}

const nuevo = (cambios: Record<string, unknown> = {}) => ({
  plantillaClave: 'recuperacion_password',
  para: 'ana@vozmuni.test',
  asunto: 'Recupera',
  texto: 'token=secreto',
  html: '<a>secreto</a>',
  ticketId: null,
  usuarioId: 7,
  expiraEn: null,
  ...cambios,
});

describe('DespachoCorreosService', () => {
  it('el primer intento envía el mensaje guardado y lo marca enviado', async () => {
    const { correos, enviador, despacho } = montar();
    const id = await correos.insertar(nuevo());
    expect(await despacho.despacharIds([id], AHORA)).toBe(true);
    expect(enviador.enviados).toEqual([{ para: 'ana@vozmuni.test', asunto: 'Recupera', texto: 'token=secreto', html: '<a>secreto</a>' }]);
    expect(correos.filas[0]).toMatchObject({ estado: 'enviado', intentos: 1 });
  });

  it('tres fallos: pendiente a +5 min, luego a +30, y después fallido con el destinatario enmascarado en el log', async () => {
    const { correos, enviador, logs, despacho } = montar();
    enviador.fallar = true;
    const id = await correos.insertar(nuevo({ ticketId: 12 }));

    expect(await despacho.despacharIds([id], AHORA)).toBe(false);
    expect(correos.filas[0]).toMatchObject({ estado: 'pendiente', intentos: 1, proximoIntentoEn: minutos(5), ultimoError: 'ECONNREFUSED smtp' });

    expect(await despacho.procesar(minutos(4))).toBe(0);
    expect(await despacho.procesar(minutos(5))).toBe(1);
    expect(correos.filas[0]).toMatchObject({ estado: 'pendiente', intentos: 2, proximoIntentoEn: minutos(35) });

    expect(await despacho.procesar(minutos(35))).toBe(1);
    expect(correos.filas[0]).toMatchObject({ estado: 'fallido', intentos: 3 });
    expect(logs).toHaveLength(3);
    expect(logs[2]).toContain('Quedó fallido tras 3 intentos (para a***@vozmuni.test, ticket_id 12)');
    // Nunca el contenido, que puede llevar un token.
    expect(logs.join(' ')).not.toContain('secreto');
  });

  it('con el enlace vencido descarta el correo sin llamar al enviador', async () => {
    const { correos, enviador, despacho } = montar();
    const id = await correos.insertar(nuevo({ expiraEn: minutos(-1) }));
    expect(await despacho.despacharIds([id], AHORA)).toBe(false);
    expect(enviador.enviados).toEqual([]);
    expect(correos.filas[0]).toMatchObject({ estado: 'descartado', intentos: 0 });
  });

  it('un correo ya terminado no se vuelve a enviar', async () => {
    const { correos, enviador, despacho } = montar();
    const id = await correos.insertar(nuevo());
    await despacho.despacharIds([id], AHORA);
    await despacho.despacharIds([id], AHORA);
    expect(await despacho.procesar(minutos(60))).toBe(0);
    expect(enviador.enviados).toHaveLength(1);
  });

  it(`más de ${TAMANO_LOTE_CORREOS} pendientes se procesan en varios lotes`, async () => {
    const { correos, enviador, despacho, transacciones } = montar();
    for (let i = 0; i < TAMANO_LOTE_CORREOS + 3; i++) {
      await correos.insertar(nuevo());
    }
    expect(await despacho.procesar(AHORA)).toBe(TAMANO_LOTE_CORREOS + 3);
    expect(transacciones()).toBe(2);
    expect(enviador.enviados).toHaveLength(TAMANO_LOTE_CORREOS + 3);
  });
});
