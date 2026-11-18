-- Matriz de evaluación - Nivel de Accesibilidad. Cada evaluación guarda su contenido
-- (identificación, criterios, hallazgos y cierre) en un documento JSON.

CREATE TABLE IF NOT EXISTS evaluaciones_accesibilidad (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  -- Número de ticket consecutivo. Un borrado o una inserción fallida dejan un hueco.
  ticket INT UNSIGNED NOT NULL AUTO_INCREMENT,
  contenido JSON NOT NULL,
  creado DATETIME(3) NOT NULL,
  actualizado DATETIME(3) NOT NULL,
  creado_por INT UNSIGNED NULL,
  actualizado_por INT UNSIGNED NULL,
  UNIQUE KEY uq_ea_ticket (ticket),
  KEY ix_ea_actualizado (actualizado),
  CONSTRAINT fk_ea_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_ea_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
