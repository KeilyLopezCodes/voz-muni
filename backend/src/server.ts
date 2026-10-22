import { createApp } from './app';
import { buildContainer } from './container';

const port = Number(process.env.PORT ?? 3000);

createApp(buildContainer()).listen(port, () => {
  console.log(`VozMuni backend escuchando en el puerto ${port}`);
});
