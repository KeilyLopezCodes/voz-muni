import { calcularCambios, sanearDetalle } from '../../../src/domain/auditoria/saneamiento';

describe('calcularCambios', () => {
  it('devuelve solo los campos distintos', () => {
    expect(calcularCambios({ nombre: 'Ana', activo: true, rol: 'tecnico' }, { nombre: 'Ana', activo: false, rol: 'tecnico' })).toEqual({
      activo: { antes: true, despues: false },
    });
  });

  it('compara en profundidad, y sin antes cada campo es un cambio desde null', () => {
    expect(calcularCambios({ campos: [{ clave: 'a' }] }, { campos: [{ clave: 'a' }] })).toEqual({});
    expect(calcularCambios(null, { nombre: 'Parques', activa: true })).toEqual({
      nombre: { antes: null, despues: 'Parques' },
      activa: { antes: null, despues: true },
    });
    expect(calcularCambios({ telefono: '55550000' }, {})).toEqual({ telefono: { antes: '55550000', despues: null } });
  });
});

describe('sanearDetalle', () => {
  it('elimina contraseñas, tokens y cualquier clave *_hash o *Hash, también anidados', () => {
    expect(
      sanearDetalle({
        cambios: { password_hash: { antes: 'x', despues: 'y' }, nombre: { antes: 'A', despues: 'B' } },
        datos: { token: 't', anidado: { tokenHash: 'h', refreshToken: 'r', firma_hash: 'f', password: 'p', otro: 1 } },
      }),
    ).toEqual({
      cambios: { nombre: { antes: 'A', despues: 'B' } },
      datos: { anidado: { otro: 1 } },
    });
  });

  it('enmascara el DPI, el teléfono y el correo, en cambios y en datos', () => {
    expect(
      sanearDetalle({
        cambios: {
          dpi: { antes: null, despues: '1234567890101' },
          telefono: { antes: '55550000', despues: '44443333' },
          email: { antes: 'ana@correo.gt', despues: 'beto@correo.gt' },
        },
        datos: { correo: 'carla@correo.gt' },
      }),
    ).toEqual({
      cambios: {
        dpi: { antes: null, despues: '*********0101' },
        telefono: { antes: '****0000', despues: '****3333' },
        email: { antes: 'a***@correo.gt', despues: 'b***@correo.gt' },
      },
      datos: { correo: 'c***@correo.gt' },
    });
  });

  it('un texto de 250 caracteres queda en 200 más …', () => {
    const { datos } = sanearDetalle({ datos: { motivo: 'a'.repeat(250) } });
    expect(datos!.motivo).toBe(`${'a'.repeat(200)}…`);
    expect(sanearDetalle({ datos: { motivo: 'a'.repeat(200) } }).datos!.motivo).toHaveLength(200);
  });

  it('omite cambios y datos vacíos, y convierte las fechas a ISO', () => {
    expect(sanearDetalle({ cambios: {}, datos: {} })).toEqual({});
    expect(sanearDetalle({ datos: { vence: new Date('2026-11-01T15:00:00.000Z') } })).toEqual({ datos: { vence: '2026-11-01T15:00:00.000Z' } });
  });
});
