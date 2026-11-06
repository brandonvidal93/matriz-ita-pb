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
- **Almacenamiento local**: los datos se guardan en un **archivo JSON de tu equipo** y el navegador guarda una copia de respaldo. Todo funciona sin servidor ni base de datos.

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

## Dónde se guardan los datos

Todo es local:

1. **Archivo de datos (recomendado).** En la cabecera, **Archivo de datos → Crear archivo de datos nuevo…** (o **Abrir…** si ya existe). Elige una ubicación, por ejemplo `D:\Develop\Matriz-ITA\datos\matriz-ita-datos.json`. Desde ese momento cada cambio se guarda solo en el archivo. Usa la *File System Access API*, que existe en **Chrome y Edge**.
   - El vínculo se recuerda. Al volver a abrir la app aparece **Reconectar matriz-ita-datos.json**, porque el navegador pide confirmar el permiso en cada sesión.
   - El archivo tiene todos los registros: `{ app, formato, guardado, registros: [...] }`.
2. **Navegador.** Siempre se guarda una copia en `localStorage` como respaldo. Si el archivo y el navegador difieren, al abrir el archivo se queda, por registro, la versión más reciente.
3. **Copias manuales.** **Descargar copia (.json)** y **Cargar copia (.json)** sirven para Firefox o para mover los datos a otro equipo.

> La carpeta `datos/` y los archivos `matriz-ita-datos*.json` están en `.gitignore` para que las respuestas y las notas internas no se suban al repositorio público.

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
    modelos.ts           Tipos: Registro, Respuesta, Evidencia
    catalogo.ts          Catálogo, secciones, texto de columna I y reglas de calidad
    almacen.service.ts   Estado (signals) y persistencia (archivo + navegador)
    archivo.service.ts   Lectura/escritura del archivo JSON local (File System Access API)
    xlsx.service.ts      Importar y exportar la matriz oficial (JSZip)
    progreso.ts          Indicadores, descarga y verificación de URLs
  dialogos/              Diálogos de Material
  paginas/               Registros, Diligenciar, Evidencias, Revisar y exportar
tools/                   Script de preparación de plantilla
```

Tecnologías: Angular 22 (componentes standalone, signals, zoneless), Angular Material 22, Tailwind CSS 4 (sin preflight) y JSZip.

---

Desarrollo Web – Gestión TIC · Institución Universitaria Pascual Bravo
