# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Gestor para diligenciar la Matriz ITA 2023 (Ley 1712 de 2014) y generar el `.xlsx` oficial. El código, los comentarios y los commits van en español.

## Requisitos

Node.js 22+ y npm 10+, Docker Desktop (MySQL de desarrollo), k6 (pruebas de carga), Git y Python 3 (solo para `tools/preparar_plantilla.py`, sin paquetes extra). El README tiene los comandos de instalación para macOS (Homebrew) y Windows (winget). Los scripts npm deben funcionar en los dos sistemas: nada de `cp`, `rm` u otros comandos de Unix; si hace falta copiar o borrar, usa `node -e` con `fs`.

## Accesibilidad (obligatorio)

Todo desarrollo debe cumplir **WCAG 2.1 nivel AA** y las directrices de accesibilidad web de MinTIC (Anexo 1 de la Resolución 1519 de 2020), aunque sea una página interna. Una tarea que toque la interfaz no está terminada hasta validar lo que cambió, en particular:

- **Teclado:** todo se puede operar sin ratón, con un orden lógico, foco visible y sin trampas de foco, también en los diálogos (2.1.1, 2.1.2, 2.4.3, 2.4.7).
- **Semántica:** encabezados, regiones y controles nativos correctos; todo control tiene un nombre accesible (1.3.1, 2.4.6, 4.1.2).
- **Formularios:** cada campo tiene su etiqueta, y los errores se identifican en texto y se asocian al campo (3.3.1, 3.3.2).
- **Errores de WAVE en formularios:** *Missing form label* (un control sin etiqueta) y *Empty form label* (una etiqueta sin contenido) penalizan el puntaje en WAVE, así que no deben quedar. Incluye los `<input hidden>`, que WAVE marca aunque no estén expuestos a los lectores de pantalla, y los controles de Material sin texto propio: un `mat-checkbox` con solo `aria-label` genera un `<label>` sin texto.
- **Mensajes de estado:** los avisos dinámicos, como el estado de guardado, se anuncian sin mover el foco (4.1.3).
- **Contraste y color:** 4.5:1 en texto, 3:1 en texto grande y en componentes de interfaz; el color nunca es la única señal, como en los estados SI, NO y N/A (1.4.1, 1.4.3, 1.4.11).
- **Adaptación:** funciona con zoom al 200 % y a 320 px de ancho sin desplazamiento horizontal (1.4.4, 1.4.10).
- **Idioma:** `<html lang>` sigue el idioma activo, y los textos accesibles (`aria-label`, `alt`) también son claves de i18n en `es.json` y `en.json` (3.1.1).

Al cerrar la tarea, indica qué criterios se validaron, cómo y cuáles no se pudieron comprobar. Una prueba automática no basta para dar por cumplido el nivel AA: el teclado y el lector de pantalla requieren revisión manual.

## Carga y estrés (obligatorio)

Para asegurar la disponibilidad, todo cambio que pueda afectar el rendimiento se valida con la prueba de carga `tools/k6/estres.js` antes de darlo por terminado: rutas o consultas de la API, migraciones e índices, el pool de MySQL (`api/src/db.ts`), el manejo de sesiones, el servidor de estáticos y cualquier versión que vaya a desplegarse.

- Se ejecuta contra el **build de producción** (`npm run build && npm --prefix api run build`), no contra `ng serve` ni `tsx watch`.
- Solo con una **base desechable**, como `matriz_ita_test`. La prueba crea registros `k6-…` y los borra al final; nunca se apunta a la base de producción ni a datos reales. El script se niega a correr contra un servidor que no sea local salvo con `ITA_PERMITIR_REMOTO=1`.
- La carga normal (`ITA_ESCALA=1`) debe cumplir todos los umbrales del script: menos de 1 % de errores; p95 de 200 ms en estáticos, de 500 ms en lectura y edición y de 1 s en guardados concurrentes sobre el mismo registro. No se relajan los umbrales para que una prueba pase: se corrige la causa o se acuerda el cambio con el equipo.
- Para buscar el límite se repite con `ITA_ESCALA=5`. Ahí se reporta dónde se degrada, aunque no tenga que pasar.
- Al cerrar la tarea se informan las cifras (p95 por escenario, tasa de errores, peticiones por segundo), la escala usada y si k6 corrió en el mismo equipo que el servidor, porque eso empeora los resultados.

Referencia (10-nov-2026, k6 y servidor en el mismo equipo): con ×1, p95 de 64 a 108 ms y 0 % de errores; con ×5, 0 % de errores pero p95 de 5 a 8 s en las rutas con base de datos, probablemente por el pool de 10 conexiones.

## Comandos

Hay dos paquetes npm: la raíz (Angular) y `api/` (Fastify). Se instalan por separado: `npm install && npm --prefix api install`.

```bash
npm run db                # MySQL 8.4 en Docker (127.0.0.1:3307), con la base matriz_ita_test
npm run api               # API en :3000 con recarga; aplica las migraciones al arrancar
npm start                 # Angular en :4200; redirige /api a :3000
npm --prefix api run crear-admin -- admin "Nombre Apellido"   # primer administrador

npm run build             # frontend (dist/matriz-ita-pb/browser)
npm --prefix api run build
npm --prefix api run typecheck

npm test                  # frontend
npm run test:api          # API
npm run test:todo         # ambos
k6 run -e ITA_URL=http://127.0.0.1:3001 -e ITA_USUARIO=admin -e ITA_CLAVE=... tools/k6/estres.js   # carga y estrés

# Una sola prueba
npx ng test --watch=false --include src/app/core/idioma.spec.ts
npx ng test --watch=false --filter "patrón del nombre"
cd api && npx vitest run test/registros.spec.ts -t "patrón del nombre"
```

No hay linter configurado. Prettier está instalado (`.prettierrc`), pero no hay un script para ejecutarlo.

La API se configura con `api/.env` (copia de `api/.env.example`). Sin `ITA_DB_URL` no arranca.

## Pruebas de integración

`api/test/ayudas.ts` **borra todas las tablas** de la base en `ITA_DB_TEST_URL` y exige que la URL contenga `test`. No la apuntes a otra base. Si la variable no está definida, las pruebas de integración se omiten con un aviso, así que un resultado en verde no garantiza que hayan corrido. Se ejecutan en serie porque comparten la base. Usan `prepararEntorno()`, que deja una cookie de sesión por rol, y `app.inject`.

## Arquitectura

En producción hay un solo proceso Node: la API (`api/src/app.ts`) atiende `/api/*` y sirve el build de Angular como archivos estáticos. El router usa `withHashLocation`, por lo que el servidor no necesita un fallback de SPA.

**Código compartido entre paquetes.** La API importa directamente desde el frontend: tipos y utilidades de `src/app/core/modelos.ts`, y `src/app/data/catalogo-ita-2023.json`, del que deriva las filas válidas y la versión de la matriz (`api/src/formatos/ita/esquemas.ts`). Un cambio en esos archivos afecta a los dos lados, y el bundle de la API los incluye al compilar.

**Formatos y permisos.** La aplicación centraliza varios formatos, listados en `FORMATOS` de `modelos.ts`: la Matriz ITA (`ita`) y la Matriz de evaluación - Nivel de Accesibilidad (`accesibilidad`). Tras el login, el panel (`paginas/panel.ts`) muestra los formatos que el usuario puede usar. El código de cada formato va en `src/app/formatos/<id>/` (rutas propias con `loadChildren` en `#/<id>`) y en `api/src/formatos/<id>/`; lo común queda en `core/`, `paginas/` y `api/src/rutas/`. El administrador accede a todos los formatos; los demás, solo a los asignados en `usuario_formatos` (`ver` o `editar`), y el lector nunca edita. El permiso efectivo se calcula en cada petición (`permisosEfectivos` en `api/src/auth.ts`). `registros.formato` separa los registros de ITA. Accesibilidad no usa esa tabla porque su estructura es otra: cada evaluación es una fila de `evaluaciones_accesibilidad`, con un `ticket` consecutivo (AUTO_INCREMENT) y su contenido en una columna JSON. `PATCH /api/accesibilidad/:id` recibe un cambio parcial y lo mezcla con `aplicarCambio()` (`formatos/accesibilidad/modelo.ts`, compartido con la interfaz) dentro de una transacción con `SELECT … FOR UPDATE`. En la interfaz, `EvaluacionesService` cumple el papel de `AlmacenService`, y las evidencias se guardan en el mismo JSON (biblioteca más ids en cada criterio y hallazgo; `completar()` rellena los campos que falten en contenidos antiguos). Los hallazgos no se crean a mano: hay uno por cada criterio en "No cumple", con id `c<fila>` (`hallazgosGenerados()` en `catalogo.ts`). Lo guardado se conserva aunque el criterio cambie de estado; sin texto propio (`null`) se usa la observación del criterio, y sin severidad, la sugerida por nivel. `modelo.ts` no importa el catálogo (`catalogo.ts`) para que este no entre en el bundle inicial.

**Modelo de datos.** Un `Registro` es un corte de la matriz. Sus `respuestas` se indexan por `fila`, el número de fila real en la hoja del `.xlsx`, que es lo que une respuesta, catálogo y celda exportada. Las `evidencias` pertenecen al registro y cada ítem las referencia por id.

**Frontend: estado y escritura.** `AlmacenService` es el estado central (signals) y la API es la fuente de verdad. Los cambios se aplican primero en pantalla y se envían por una cola en serie para conservar el orden; los textos esperan `ESPERA_TEXTO_MS` tras la última tecla. Si un envío falla, se recarga el registro. Toda escritura de la interfaz debe pasar por este servicio. Antes de leer del servidor se llama a `vaciar()` para no perder cambios pendientes, y la guardia `activarRegistro` refresca el registro al entrar a `r/:id`.

**API: escritura.** Los cambios sobre un registro pasan por el helper `cambiar()` de `api/src/formatos/ita/rutas.ts`: abre una transacción, bloquea el registro, aplica el cambio, actualiza la marca de modificación y audita. Las nuevas mutaciones deben usarlo. Las entradas se validan con zod en `esquemas.ts` (comunes) y `formatos/ita/esquemas.ts`, y el manejador de errores de `app.ts` convierte `ZodError` en 400 y `NoEncontrado` en 404. Los permisos se validan en el servidor con `requiere(...)` (rol) y `requiereFormato(formato, permiso)`; la interfaz solo oculta lo que el rol no puede hacer. Las peticiones que modifican datos también pasan una verificación de `Origin`.

**Migraciones.** `api/src/migraciones/NNN_nombre.sql` se aplica en orden al arrancar y se registra por nombre en la tabla `migraciones`, así que los cambios de esquema van en un archivo nuevo. El ejecutor separa las sentencias por `;` al final de línea. MySQL hace commit implícito en DDL y no hay rollback: cada migración debe poder reintentarse.

**Exportar e importar `.xlsx`.** `XlsxService` edita con JSZip el XML de `public/plantilla/matriz-ita-2023.xlsx`. Solo escribe las columnas F, G, H e I de las filas de ítems; el resto del archivo debe quedar intacto, por lo que no se debe regenerar con una librería de hojas de cálculo. La plantilla y el catálogo se generan con `python tools/preparar_plantilla.py <matriz.xlsx>`. Accesibilidad sigue la misma regla: `formatos/accesibilidad/exportar.ts` escribe solo las celdas que vacía `python tools/preparar_accesibilidad.py <matriz.xlsx>` (hojas 1 a 4), y la plantilla tiene `fullCalcOnLoad` para que Excel recalcule el consolidado y los gráficos al abrirla. Los archivos de origen están en `tools/origen/`.

## Formatos: misma experiencia (obligatorio)

Cada formato cambia la funcionalidad, pero la interfaz es la de la Matriz ITA: mismos colores, íconos, componentes y flujo. Al montar un formato nuevo:

- **Rutas y menú:** `#/<id>` (listado) y `#/<id>/r/:id` con tres hijas: `''` (Diligenciar), `evidencias` y `resumen` (Revisar y exportar). El menú azul del encabezado (`App.activo` en `app.ts`) muestra esas tres opciones para el registro abierto; agrega ahí el formato nuevo.
- **Miga de pan:** cada ruta visible declara `data: { miga: 'clave.i18n' }`, y la de `r/:id`, `'@registro'` (el nombre se resuelve en `core/miga.ts`).
- **Diligenciar:** la barra lateral de secciones con avance, la búsqueda, los filtros Todos / Pendientes / Por revisar, la selección con la barra de acciones masivas y las tarjetas de ítem con las clases compartidas de `styles.scss` (`.lateral`, `.tarjeta-item`, `.barra-acciones`). Los estados usan los colores de SI, NO y N/A (`t-SI`, `t-NO`, `t-NA`).
- **Evidencias:** biblioteca de URL por registro, reutilizable entre ítems, con el bloque `app-evidencias-item` (chips, botón Evidencia y nota interna, que nunca se exporta) y la observación en su propio campo. La página `paginas/evidencias.ts` y los diálogos de elegir y asignar son comunes: el formato solo implementa `FuenteEvidencias` (`core/evidencias.ts`) y la provee con `FUENTE_EVIDENCIAS` en su ruta `r/:id`. Al exportar, las evidencias van con la observación (`textoObservacion`).
- **Respaldo .json:** `GET/POST /api/<id>/respaldo` (ITA usa `/api/respaldo`) con las reglas de restauración de ITA (nunca sobrescribe: omite lo ya cargado y crea copia de lo que cambió). Se agrega el formato a `RespaldoDialog` (`dialogos/dialogos.ts`), que se abre desde el menú del usuario con el formato actual ya elegido.
- **Revisar y exportar:** indicadores, avance por sección, elementos por revisar (las mismas reglas de ITA: cumple sin soporte, no aplica sin justificación, no cumple sin observación) y el formato de evidencias (solo URL o título y URL).


- Angular 22 con componentes standalone, signals y sin zone.js. Rutas con carga diferida en `app.routes.ts`.
- Cada template va en su propio `.html` junto al componente (`templateUrl`); los estilos, que son pocos, van en línea en `styles`. `dialogos/dialogos.ts` agrupa varios diálogos, cada uno con su `.html`.
- Tailwind CSS 4 convive con Angular Material; las clases propias compartidas están en `src/styles.scss`.
- Toda página nueva va en `paginas/mapa.html` (mapa del sitio, exigido por el Anexo 1), y su título en `app.routes.ts` es una clave `titulos.*` que traduce `TituloTraducido`.
- **Espaciado de formularios:** los campos van en un contenedor `grid` o `flex flex-col` con `gap-4` (16 px) como mínimo entre ellos, también entre columnas, y sin `mb-*` sueltos en cada campo. `mat-form-field` usa por defecto `subscriptSizing: 'dynamic'` (`app.config.ts`): la ayuda (`mat-hint`) y el error ocupan su alto real, así que sin ese `gap` quedan pegados o debajo de la etiqueta del campo siguiente. `sin-pie` oculta la ayuda y el error, por lo que solo sirve en campos que no tienen ninguno de los dos, como las búsquedas.
- **Revisión visual (obligatoria al tocar la interfaz):** a 360 px y a 1280 px, en un navegador real, comprobar:
  - **Alineación vertical:** los elementos de una misma fila (celdas de tabla, botones, chips, íconos junto a texto) quedan centrados entre sí; las celdas de tabla usan `vertical-align: middle`, y un ícono junto a un texto de varias líneas se alinea con la primera línea (`.aviso`).
  - **Íconos completos:** ninguno se recorta ni se encoge. `mat-icon` tiene `flex-shrink: 0` global en `styles.scss`; no se le pone un ancho menor que su tamaño de fuente.
  - **Sin desplazamiento horizontal:** las tablas llevan `tabla-apilada` (cada fila pasa a tarjeta en móvil) y cada celda, salvo la primera, su encabezado en `[attr.data-etiqueta]`; `.completa` ocupa todo el ancho. No se usa `overflow-x-auto` para esconder el desborde.
  - **Separación:** los avisos van con `.aviso` (en bloque, uno por línea) dentro de un contenedor con `gap`, nunca seguidos sin espacio.
- Si un control desaparece al usarlo, hay que mover el foco a otro elemento: `core/foco.ts` tiene los helpers. Los errores van dentro del campo con `mat-error` (`errorSi` para validaciones propias); no se desactiva el botón de enviar para indicar que faltan datos.
- **i18n (Transloco):** todo texto de la interfaz es una clave en `public/i18n/es.json` y `en.json`. Una prueba exige que ambos tengan las mismas claves, así que toda clave nueva va en los dos. El catálogo oficial ITA y el `.xlsx` exportado **se quedan siempre en español**. Las fechas usan el pipe `fecha` (`FechaPipe`), no `DatePipe`, porque `LOCALE_ID` se fija al arrancar y no sigue el cambio de idioma.
