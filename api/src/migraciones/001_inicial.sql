-- Esquema inicial de la Matriz ITA (MySQL 8.0+). Fechas en UTC.

CREATE TABLE usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(60) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  rol ENUM('admin', 'editor', 'lector') NOT NULL DEFAULT 'lector',
  clave_hash VARCHAR(100) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  debe_cambiar_clave TINYINT(1) NOT NULL DEFAULT 1,
  creado DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  ultimo_ingreso DATETIME(3) NULL,
  UNIQUE KEY uq_usuarios_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Solo se guarda el hash SHA-256 del token; el token viaja en una cookie httpOnly.
CREATE TABLE sesiones (
  id CHAR(64) NOT NULL PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  creada DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expira DATETIME(3) NOT NULL,
  KEY ix_sesiones_usuario (usuario_id),
  KEY ix_sesiones_expira (expira),
  CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Un corte (diligenciamiento completo) de la matriz.
CREATE TABLE registros (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  tipo ENUM('procuraduria', 'seguimiento') NOT NULL,
  vigencia SMALLINT UNSIGNED NOT NULL,
  periodo VARCHAR(60) NULL,
  version_matriz VARCHAR(30) NOT NULL,
  formato_evidencias ENUM('url', 'titulo-url') NOT NULL DEFAULT 'url',
  creado DATETIME(3) NOT NULL,
  actualizado DATETIME(3) NOT NULL,
  creado_por INT UNSIGNED NULL,
  actualizado_por INT UNSIGNED NULL,
  KEY ix_registros_actualizado (actualizado),
  CONSTRAINT fk_registros_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_registros_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Evidencias reutilizables dentro de un registro. Los ids se conservan al copiar
-- un registro, por eso la clave es (registro_id, id).
CREATE TABLE evidencias (
  registro_id VARCHAR(36) NOT NULL,
  id VARCHAR(36) NOT NULL,
  orden INT UNSIGNED NOT NULL DEFAULT 0,
  titulo VARCHAR(500) NOT NULL DEFAULT '',
  url VARCHAR(2048) NOT NULL,
  descripcion TEXT NULL,
  verif_fecha DATETIME(3) NULL,
  verif_estado ENUM('ok', 'error', 'desconocido') NULL,
  verif_detalle VARCHAR(500) NULL,
  PRIMARY KEY (registro_id, id),
  CONSTRAINT fk_evidencias_registro FOREIGN KEY (registro_id) REFERENCES registros (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Una fila por ítem diligenciado (fila de la plantilla oficial).
CREATE TABLE respuestas (
  registro_id VARCHAR(36) NOT NULL,
  fila SMALLINT UNSIGNED NOT NULL,
  estado ENUM('SI', 'NO', 'NA') NULL,
  observacion TEXT NOT NULL,
  nota_interna TEXT NULL,
  actualizado DATETIME(3) NULL,
  actualizado_por INT UNSIGNED NULL,
  PRIMARY KEY (registro_id, fila),
  CONSTRAINT fk_respuestas_registro FOREIGN KEY (registro_id) REFERENCES registros (id) ON DELETE CASCADE,
  CONSTRAINT fk_respuestas_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE respuesta_evidencias (
  registro_id VARCHAR(36) NOT NULL,
  fila SMALLINT UNSIGNED NOT NULL,
  evidencia_id VARCHAR(36) NOT NULL,
  orden INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (registro_id, fila, evidencia_id),
  KEY ix_re_evidencia (registro_id, evidencia_id),
  CONSTRAINT fk_re_respuesta FOREIGN KEY (registro_id, fila) REFERENCES respuestas (registro_id, fila) ON DELETE CASCADE,
  CONSTRAINT fk_re_evidencia FOREIGN KEY (registro_id, evidencia_id) REFERENCES evidencias (registro_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Historial de cambios. Sin claves foráneas para conservarlo aunque se borre el registro o el usuario.
CREATE TABLE auditoria (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fecha DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  usuario_id INT UNSIGNED NULL,
  usuario VARCHAR(60) NULL,
  registro_id VARCHAR(36) NULL,
  accion VARCHAR(60) NOT NULL,
  detalle JSON NULL,
  KEY ix_auditoria_registro (registro_id, fecha),
  KEY ix_auditoria_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
