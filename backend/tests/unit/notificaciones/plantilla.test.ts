import { type Plantilla, renderizar } from '../../../src/domain/notificaciones/plantilla';

const plantilla: Plantilla = {
  clave: 'prueba',
  asunto: 'Hola {{nombre}}',
  cuerpoTexto: '{{nombre}}, abre {{enlace}}. Repito: {{enlace}}',
  cuerpoHtml: '<p>{{nombre}}</p><a href="{{enlace}}">{{enlace}}</a>',
};

describe('renderizar', () => {
  it('reemplaza todas las apariciones de cada variable', () => {
    expect(renderizar(plantilla, { nombre: 'Ana', enlace: 'http://x/r?token=abc' })).toEqual({
      asunto: 'Hola Ana',
      texto: 'Ana, abre http://x/r?token=abc. Repito: http://x/r?token=abc',
      html: '<p>Ana</p><a href="http://x/r?token=abc">http://x/r?token=abc</a>',
    });
  });

  it('escapa los valores en html pero no en texto ni en el asunto', () => {
    const correo = renderizar(plantilla, { nombre: '<script>alert("x")</script>', enlace: "a&b'c" });

    expect(correo.html).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p><a href="a&amp;b&#39;c">a&amp;b&#39;c</a>',
    );
    expect(correo.texto).toContain('<script>alert("x")</script>');
    expect(correo.asunto).toBe('Hola <script>alert("x")</script>');
  });

  it('lanza error si falta una variable', () => {
    expect(() => renderizar(plantilla, { nombre: 'Ana' })).toThrow(/enlace/);
  });

  it('acepta un valor vacío y no toca el texto fijo de la plantilla', () => {
    const correo = renderizar({ ...plantilla, cuerpoHtml: '<b>{{nombre}}</b> & más' }, { nombre: '', enlace: '' });

    expect(correo.html).toBe('<b></b> & más');
  });
});
