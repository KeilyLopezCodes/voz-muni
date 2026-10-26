import express from 'express';
import request from 'supertest';
import { limitePorIp } from '../../../src/presentation/middlewares/limite-por-ip';
import { manejadorErrores } from '../../../src/presentation/middlewares/manejador-errores';

// Una app mínima con dos rutas, cada una con su propio límite.
function app(limite: number) {
  const aplicacion = express();
  aplicacion.get('/uno', limitePorIp(limite, 'Demasiadas consultas'), (_req, res) => void res.status(200).json({ ok: true }));
  aplicacion.get('/dos', limitePorIp(limite, 'Otro mensaje'), (_req, res) => void res.status(200).json({ ok: true }));
  aplicacion.use(manejadorErrores);
  return aplicacion;
}

describe('limitePorIp', () => {
  it('deja pasar hasta el límite y después responde 429 DEMASIADAS_PETICIONES con su mensaje', async () => {
    const aplicacion = app(2);

    expect((await request(aplicacion).get('/uno')).status).toBe(200);
    expect((await request(aplicacion).get('/uno')).status).toBe(200);
    const tercera = await request(aplicacion).get('/uno');

    expect(tercera.status).toBe(429);
    expect(tercera.body).toEqual({ codigo: 'DEMASIADAS_PETICIONES', mensaje: 'Demasiadas consultas' });
  });

  it('cada límite lleva su propio contador', async () => {
    const aplicacion = app(1);

    expect((await request(aplicacion).get('/uno')).status).toBe(200);
    expect((await request(aplicacion).get('/uno')).status).toBe(429);
    expect((await request(aplicacion).get('/dos')).status).toBe(200);
  });
});
