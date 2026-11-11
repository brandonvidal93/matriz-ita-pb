# Matriz ITA – Gestión del diligenciamiento

Sitio web para diligenciar la **Matriz de Cumplimiento del Índice de Transparencia y Acceso a la Información (ITA)**, versión 2023, de la Procuraduría General de la Nación (Ley 1712 de 2014). Lo usa Gestión TIC de la Institución Universitaria Pascual Bravo.

Al terminar, el sitio genera el **archivo oficial .xlsx** listo para enviar. Escribe sobre la plantilla original y solo llena las columnas F, G, H (SI / NO / N/A) e I (observaciones y evidencias). No cambia la estructura, los estilos, las celdas combinadas ni la hoja de instrucciones.

> Este archivo no reemplaza el diligenciamiento en el aplicativo ITA de la Procuraduría (https://apps.procuraduria.gov.co/ita/). Sirve para preparar, soportar y revisar la información antes de cargarla.

## Funcionalidades

- **Registros por corte**: reporte anual a la Procuraduría o seguimiento interno (por ejemplo, semestral). Un corte nuevo puede partir de una copia del anterior.
- **Diligenciamiento por secciones** (Nivel I de la matriz), con avance por sección, búsqueda en toda la matriz y filtros *Pendientes* y *Por revisar*.
- **Biblioteca de evidencias reutilizables**: cada URL se registra una vez y se asigna a todos los ítems que respalda, desde el ítem o desde la biblioteca con un árbol de selección.
- **Acciones masivas**: marcar SI, NO o N/A, asignar evidencia o escribir la misma observación en varios ítems seleccionados.
- **Vista previa** del texto exacto que quedará en la columna I.
- **Reglas de calidad**: avisa si un ítem SI no tiene soporte, si un N/A no tiene justificación jurídica (Numeral 2.4.2 del Anexo 2) o si un NO no tiene observación.
- **Importar** una matriz ya diligenciada (.xlsx). Se reutilizan sus respuestas y se extraen las URLs como evidencias.
- **Verificación de enlaces**: comprueba que el servidor de cada URL responda.
- **Notas internas** por ítem que no se exportan.
- **Multiusuario con MySQL**: los registros viven en una base de datos compartida. Cada respuesta se guarda por ítem, así varias personas pueden diligenciar a la vez sin pisarse.
- **Usuarios y roles**: *Administrador* (gestiona usuarios, restaura respaldos y elimina registros), *Editor* (diligencia) y *Lector* (consulta y exporta).
- **Auditoría**: queda registrado quién cambió qué y cuándo. Al eliminar un registro se guarda una copia completa en el historial.

## Arquitectura

```
Navegador (Angular)  ──/api──▶  API Node (Fastify)  ──▶  MySQL 8
                     ◀── sitio estático (dist/) ──┘
```

La API (`api/`) también sirve el sitio compilado. En producción hay **un solo proceso Node** y una base MySQL.

## Requisitos

| Herramienta | Para qué |
|---|---|
| Node.js 22 o superior y npm 10 o superior | Frontend y API |
| Docker Desktop | MySQL 8.4 de desarrollo y pruebas (`npm run db`). En producción, MySQL 8.0 o superior |
| Git | Control de versiones |
| k6 | Pruebas de carga y estrés |
| Python 3 | Solo para regenerar la plantilla (`tools/preparar_plantilla.py`); no necesita paquetes extra |

### macOS (con [Homebrew](https://brew.sh))

```bash
brew install node@22 git k6 python
brew install --cask docker        # luego abre Docker Desktop una vez
```

Si `node -v` no muestra la versión 22, ejecuta `brew link --overwrite node@22`.

### Windows (con winget, en PowerShell)

```powershell
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
winget install -e --id Docker.DockerDesktop     # requiere WSL 2; reinicia si lo pide
winget install -e --id GrafanaLabs.k6
winget install -e --id Python.Python.3.13
```

Cierra y abre la terminal para que tome el nuevo `PATH`, y comprueba con `node -v`, `npm -v`, `docker --version`, `k6 version` y `python --version`. Los scripts npm funcionan igual en PowerShell, CMD o Git Bash.

## Desarrollo local

```bash
npm install && npm --prefix api install
npm run db                        # MySQL 8.4 en Docker (puerto 3307), con base de pruebas
cp api/.env.example api/.env      # ajusta si hace falta
npm --prefix api run crear-admin -- admin "Nombre Apellido"   # primer administrador
npm run api                       # API en http://localhost:3000 (aplica migraciones)
                                  # con ITA_DOCS=true: Swagger en http://localhost:3000/api/docs (no en producción)
npm start                         # Angular en http://localhost:4200 (redirige /api a :3000)
```

En el primer ingreso, cada usuario debe cambiar la contraseña temporal.

## Pruebas

```bash
npm test          # frontend: Vitest (catálogo, progreso, exportación .xlsx, almacén, guardias)
npm run test:api  # API: esquemas + integración contra MySQL (ITA_DB_TEST_URL)
npm run test:todo
```

Las pruebas de integración **vacían** la base indicada en `ITA_DB_TEST_URL`. Por seguridad, su nombre debe contener `test`. Si la variable no está definida, se omiten con un aviso.

### Carga y estrés

`tools/k6/estres.js` simula usuarios que descargan el sitio, consultan registros, diligencian cada uno su registro y guardan al mismo tiempo sobre un mismo registro. Es obligatoria antes de desplegar y en todo cambio que pueda afectar el rendimiento (consultas, migraciones, pool de MySQL, sesiones).

Se ejecuta contra el build de producción y una **base desechable**: crea registros `k6-…` y los borra al terminar.

```bash
npm run build && npm --prefix api run build
# API compilada en el puerto 3001 sobre la base de pruebas (ajusta la URL a tu ITA_DB_TEST_URL)
ITA_DB_URL=mysql://ita:...@127.0.0.1:3307/matriz_ita_test ITA_PUERTO=3001 NODE_ENV=production ITA_COOKIE_SEGURA=false npm --prefix api start
# en otra terminal, con un administrador de esa base que ya haya cambiado su contraseña temporal
k6 run -e ITA_URL=http://127.0.0.1:3001 -e ITA_USUARIO=admin -e ITA_CLAVE=... tools/k6/estres.js
```

En PowerShell, las variables se definen antes del comando: `$env:ITA_DB_URL='...'; $env:ITA_PUERTO='3001'; ...; npm --prefix api start`.

Con la carga normal deben cumplirse todos los umbrales del script (menos de 1 % de errores y p95 de 200 ms a 1 s según el escenario). `-e ITA_ESCALA=5` multiplica la carga para buscar el límite.

## Despliegue en el servidor institucional

1. Crear la base y un usuario MySQL con permisos solo sobre ella (`CREATE`, `ALTER`, `INDEX`, `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `REFERENCES`).
2. Compilar: `npm run build && npm --prefix api run build`.
3. Copiar al servidor `dist/` y `api/` (con `api/dist` y `api/package*.json`) y ejecutar `npm --prefix api ci --omit=dev`.
4. Crear `api/.env` con `NODE_ENV=production`, `ITA_DB_URL`, `ITA_COOKIE_SEGURA=true` y, si va detrás de IIS o Nginx, `ITA_CONFIAR_PROXY=true`.
5. Crear el administrador: `node --env-file=api/.env api/dist/scripts/crear-admin.mjs admin "Nombre"`.
6. Iniciar con `npm --prefix api start` como servicio (PM2, NSSM en Windows o systemd). Las migraciones se aplican solas al arrancar.
7. Publicar **solo por HTTPS**, con un proxy inverso hacia el puerto `ITA_PUERTO`.

Las variables disponibles están en `api/.env.example`.

## Migrar los datos del antiguo archivo local

Si usabas la versión anterior (archivo `matriz-ita-datos.json` o *Descargar copia*):

1. Ingresa como administrador.
2. En el menú de usuario, elige **Restaurar o migrar respaldo (.json)…** y selecciona el archivo.
3. Los registros se crean con el mismo id. Si vuelves a cargar el mismo archivo, se omiten los que ya estaban. Nunca se sobrescribe nada.

## Seguridad

- Contraseñas con bcrypt (costo 12) y una política mínima de 10 caracteres con letras y números.
- La sesión va en una cookie `httpOnly` + `SameSite=Strict` (y `Secure` en producción). En la base solo se guarda el hash del token. Al cambiar la contraseña, desactivar al usuario o cambiar su rol, se cierran sus sesiones. La sesión vence tras `ITA_SESION_MINUTOS` de inactividad, y el sitio avisa 5 minutos antes para poder extenderla.
- Límite de intentos de ingreso y verificación de `Origin` en las peticiones que modifican datos.
- Los permisos por rol se validan **en el servidor**. La interfaz solo oculta lo que el rol no puede hacer.
- Siempre queda al menos un administrador activo.

## Plantilla oficial y catálogo

- `public/plantilla/matriz-ita-2023.xlsx`: plantilla oficial en blanco.
- `src/app/data/catalogo-ita-2023.json`: los 270 ítems de la plantilla (fila, sección, subnivel, ítem, explicación y normatividad).

Los dos archivos se generan desde la matriz con:

```bash
python tools/preparar_plantilla.py <matriz.xlsx>
```

El script trabaja directamente sobre el XML del .xlsx. Vacía F a I en las filas de ítems y retira las imágenes y los hipervínculos pegados como evidencia. No toca nada más. Si la Procuraduría publica una nueva versión de la matriz, se corre de nuevo con el archivo nuevo y se revisan los cambios del catálogo.

## Estructura

```
src/app/
  config.ts              Configuración (institución)
  core/
    modelos.ts           Tipos compartidos con la API: Registro, Respuesta, Evidencia, Usuario
    catalogo.ts          Catálogo, secciones, texto de columna I y reglas de calidad
    almacen.service.ts   Estado (signals) y escrituras optimistas a la API, en orden
    auth.service.ts      Sesión del usuario
    guardias.ts          Guards de ruta e interceptor de sesión vencida
    xlsx.service.ts      Importar y exportar la matriz oficial (JSZip)
    progreso.ts          Indicadores, descarga y verificación de URLs
  dialogos/              Diálogos de Material
  paginas/               Ingresar, Registros, Diligenciar, Evidencias, Revisar y exportar, Usuarios, Mapa del sitio
api/
  src/
    app.ts               Servidor Fastify: seguridad, errores, rutas y sitio estático
    esquemas.ts          Validación de entradas (zod)
    repositorio.ts       Lectura y escritura de registros en MySQL
    auth.ts              Contraseñas, sesiones y permisos por rol
    rutas/               auth, usuarios, registros, respaldo
    migraciones/         SQL versionado (se aplica al arrancar)
    scripts/             crear-admin
  test/                  Pruebas unitarias y de integración (Vitest)
tools/                   Preparación de plantilla (Python) y prueba de carga (k6/estres.js)
```

Tecnologías: Angular 22 (componentes standalone, signals, zoneless), Angular Material 22, Tailwind CSS 4 (sin preflight), JSZip, Fastify 5, mysql2, zod, Vitest y k6.

---

Desarrollo Web – Gestión TIC · Institución Universitaria Pascual Bravo
