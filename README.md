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
- **Almacenamiento**: siempre en el navegador y, opcionalmente, en **Google Drive** (carpeta `Matriz ITA - Gestión TIC`). También se pueden descargar y restaurar respaldos .json.

## Requisitos

- Node.js 22 o superior
- npm 10 o superior

## Ejecutar en local

```bash
npm install
npm start          # http://localhost:4200
```

Compilación para publicar como sitio estático:

```bash
npm run build      # salida en dist/matriz-ita-pb/browser
```

La app usa enrutamiento con `#` y `<base href="./">`. Por eso la carpeta `browser` se puede servir desde cualquier ruta (IIS, Apache, Nginx o una subcarpeta del servidor institucional) sin reglas de reescritura.

## Conectar Google Drive

1. En [Google Cloud Console](https://console.cloud.google.com/), con la cuenta institucional, crea o elige un proyecto.
2. **APIs y servicios → Biblioteca**: habilita **Google Drive API**.
3. **Pantalla de consentimiento OAuth**: tipo *Interno*, para que solo entren cuentas del dominio institucional. Agrega el permiso `.../auth/drive.file`.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**. En *Orígenes autorizados de JavaScript* agrega `http://localhost:4200` y la URL donde se publique el sitio.
5. Copia el ID de cliente en `src/app/config.ts` → `googleClientId`.

La app pide solo el permiso `drive.file`: únicamente ve los archivos que ella misma crea. Cada registro se guarda como `registro-<vigencia>-<id>.json`, y opcionalmente una copia de cada .xlsx exportado. No hay base de datos ni servidor propio.

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
  config.ts              Configuración (Google, institución)
  core/
    modelos.ts           Tipos: Registro, Respuesta, Evidencia
    catalogo.ts          Catálogo, secciones, texto de columna I y reglas de calidad
    almacen.service.ts   Estado (signals) y persistencia local + Drive
    drive.service.ts     Google Identity Services + Drive API v3
    xlsx.service.ts      Importar y exportar la matriz oficial (JSZip)
    progreso.ts          Indicadores, descarga y verificación de URLs
  dialogos/              Diálogos de Material
  paginas/               Registros, Diligenciar, Evidencias, Revisar y exportar
tools/                   Script de preparación de plantilla
```

Tecnologías: Angular 22 (componentes standalone, signals, zoneless), Angular Material 22, Tailwind CSS 4 (sin preflight) y JSZip.

---

Desarrollo Web – Gestión TIC · Institución Universitaria Pascual Bravo
