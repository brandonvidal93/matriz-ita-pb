// Prueba de estrés de la API, la base de datos y los archivos estáticos con k6 (https://grafana.com/docs/k6/).
//
// Uso (contra el build de producción, nunca contra `ng serve`):
//   npm run build && npm --prefix api run build && npm --prefix api start
//   k6 run -e ITA_USUARIO=admin -e ITA_CLAVE=... tools/k6/estres.js
// Sin instalar k6, con Docker (desde la raíz del repositorio):
//   docker run --rm -v "$PWD:/repo" -w /repo grafana/k6:1.3.0 run -e ITA_URL=http://host.docker.internal:3000 -e ITA_USUARIO=admin -e ITA_CLAVE=... tools/k6/estres.js
//
// Variables: ITA_URL (por defecto http://localhost:3000), ITA_USUARIO y ITA_CLAVE (de un administrador),
// ITA_REGISTROS (registros de prueba, por defecto 10), ITA_ESCALA (multiplica la carga, por defecto 1)
// e ITA_PERMITIR_REMOTO=1 para apuntar a un servidor que no sea local.
//
// Crea registros con el prefijo "k6-" y los elimina al terminar. Úsalo solo con una base desechable.

import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE = (__ENV.ITA_URL || 'http://localhost:3000').replace(/\/$/, '');
const N_REGISTROS = Number(__ENV.ITA_REGISTROS || 10);
const ESCALA = Number(__ENV.ITA_ESCALA || 1);
const FILAS = JSON.parse(open('../../src/app/data/catalogo-ita-2023.json'))
  .items.filter((i) => i.tipo === 'cumplimiento')
  .map((i) => i.fila);
const ESTADOS = ['SI', 'NO', 'NA', null];

if (!/^https?:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)(:\d+)?$/.test(BASE) && __ENV.ITA_PERMITIR_REMOTO !== '1')
  throw new Error(`${BASE} no es local. La prueba crea y borra datos; usa ITA_PERMITIR_REMOTO=1 si de verdad es una base desechable.`);

const n = (x) => Math.max(1, Math.round(x * ESCALA));

export const options = {
  scenarios: {
    // Usuarios que abren el sitio: index.html y los .js/.css que enlaza.
    estaticos: {
      executor: 'ramping-vus', exec: 'estaticos',
      stages: [{ duration: '30s', target: n(20) }, { duration: '1m', target: n(20) }, { duration: '15s', target: 0 }],
    },
    // Listado y detalle de registros (lecturas grandes: un registro trae 270 respuestas).
    lectura: {
      executor: 'ramping-vus', exec: 'lectura',
      stages: [{ duration: '30s', target: n(30) }, { duration: '1m', target: n(30) }, { duration: '15s', target: 0 }],
    },
    // Cada usuario diligencia su propio registro: mide el ritmo normal de escritura.
    edicion: {
      executor: 'ramping-vus', exec: 'edicion',
      stages: [{ duration: '30s', target: n(N_REGISTROS) }, { duration: '1m', target: n(N_REGISTROS) }, { duration: '15s', target: 0 }],
    },
    // Muchos usuarios guardando en el MISMO registro: compiten por el bloqueo de cambiar().
    contencion: {
      executor: 'constant-arrival-rate', exec: 'contencion',
      rate: n(20), timeUnit: '1s', duration: '1m', startTime: '30s',
      preAllocatedVUs: n(20), maxVUs: n(100),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scenario:estaticos}': ['p(95)<200'],
    'http_req_duration{scenario:lectura}': ['p(95)<500'],
    'http_req_duration{scenario:edicion}': ['p(95)<500'],
    'http_req_duration{scenario:contencion}': ['p(95)<1000'],
    checks: ['rate>0.99'],
  },
};

const json = { 'Content-Type': 'application/json' };
const conSesion = (cookie, extra = {}) => ({ headers: { ...json, Cookie: cookie }, ...extra });
const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];

// Una sola sesión para todos: el ingreso tiene límite de 10 intentos cada 5 minutos por IP.
export function setup() {
  if (!__ENV.ITA_USUARIO || !__ENV.ITA_CLAVE) fail('Faltan ITA_USUARIO e ITA_CLAVE (de un administrador).');
  const r = http.post(`${BASE}/api/auth/ingresar`, JSON.stringify({ usuario: __ENV.ITA_USUARIO, clave: __ENV.ITA_CLAVE }), { headers: json });
  if (r.status !== 200) fail(`No se pudo ingresar (${r.status}): ${r.body}`);
  if (r.json('rol') !== 'admin') fail('El usuario debe ser administrador para poder eliminar los registros de prueba al terminar.');
  const cookie = `ita_sesion=${r.cookies['ita_sesion'][0].value}`;

  const sufijo = Date.now().toString(36);
  const ids = [];
  for (let i = 0; i <= N_REGISTROS; i++) {
    const id = `k6-${sufijo}-${i}`;
    const c = http.post(`${BASE}/api/registros`, JSON.stringify({ id, nombre: `k6 estrés ${i}`, tipo: 'seguimiento', vigencia: 2026 }), conSesion(cookie));
    if (c.status !== 201) fail(`No se pudo crear el registro de prueba (${c.status}): ${c.body}`);
    ids.push(id);
  }

  const index = http.get(`${BASE}/`).body || '';
  const assets = [...index.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  // El último registro es el compartido del escenario de contención.
  return { cookie, propios: ids.slice(0, -1), compartido: ids[ids.length - 1], assets };
}

export function estaticos(d) {
  const r = http.get(`${BASE}/`);
  check(r, { 'index 200': (x) => x.status === 200 });
  const res = http.batch(d.assets.map((a) => ['GET', `${BASE}/${a.replace(/^\//, '')}`]));
  check(res, { 'assets 200': (xs) => xs.every((x) => x.status === 200) });
  sleep(1);
}

export function lectura(d) {
  const l = http.get(`${BASE}/api/registros`, conSesion(d.cookie, { tags: { name: 'GET /api/registros' } }));
  check(l, { 'listado 200': (x) => x.status === 200 });
  const r = http.get(`${BASE}/api/registros/${azar(d.propios)}`, conSesion(d.cookie, { tags: { name: 'GET /api/registros/:id' } }));
  check(r, { 'detalle 200': (x) => x.status === 200 });
  sleep(1);
}

function guardar(d, id) {
  const cambios = Math.random() < 0.5 ? { estado: azar(ESTADOS) } : { observacion: `Observación de prueba ${Date.now()}` };
  const r = http.patch(
    `${BASE}/api/registros/${id}/respuestas`,
    JSON.stringify({ filas: [azar(FILAS)], cambios }),
    conSesion(d.cookie, { tags: { name: 'PATCH /api/registros/:id/respuestas' } }),
  );
  check(r, { 'guardado 200': (x) => x.status === 200 });
}

export function edicion(d) {
  guardar(d, d.propios[(__VU - 1) % d.propios.length]);
  sleep(1); // ritmo de una persona: la interfaz agrupa lo que se escribe antes de enviarlo
}

export function contencion(d) {
  guardar(d, d.compartido);
}

export function teardown(d) {
  for (const id of [...d.propios, d.compartido]) {
    // Sin Content-Type: Fastify rechaza con 400 un cuerpo JSON vacío.
    const r = http.del(`${BASE}/api/registros/${id}`, null, { headers: { Cookie: d.cookie } });
    if (r.status >= 300) console.warn(`No se eliminó ${id} (${r.status}); bórralo a mano.`);
  }
}
