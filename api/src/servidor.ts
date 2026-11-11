import { construirApp } from './app';
import { leerConfig } from './config';
import { crearPool, migrar } from './db';

const config = leerConfig();
const db = crearPool(config.dbUrl);

const aplicadas = await migrar(db);
const app = await construirApp({ db, config }, { logger: true });
if (aplicadas.length) app.log.info({ aplicadas }, 'Migraciones aplicadas');
if (!config.webDir) app.log.info('ITA_WEB_DIR vacío: solo se sirve la API');

const cerrar = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);

await app.listen({ port: config.puerto, host: config.host });
