-- Varios formatos en la misma aplicación y permisos por formato.
-- El ALTER va al final: si algo falla antes, la migración se puede reintentar completa.

-- Permiso de cada usuario en cada formato. El administrador no necesita filas: accede a todos.
CREATE TABLE IF NOT EXISTS usuario_formatos (
  usuario_id INT UNSIGNED NOT NULL,
  formato VARCHAR(30) NOT NULL,
  permiso ENUM('ver', 'editar') NOT NULL,
  PRIMARY KEY (usuario_id, formato),
  CONSTRAINT fk_uf_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Los usuarios actuales conservan su acceso a la matriz ITA con el permiso de su rol.
INSERT IGNORE INTO usuario_formatos (usuario_id, formato, permiso)
SELECT id, 'ita', IF(rol = 'lector', 'ver', 'editar') FROM usuarios WHERE rol <> 'admin';

ALTER TABLE registros
  ADD COLUMN formato VARCHAR(30) NOT NULL DEFAULT 'ita' AFTER id,
  ADD KEY ix_registros_formato (formato, actualizado);
