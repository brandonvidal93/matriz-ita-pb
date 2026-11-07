-- Base separada para las pruebas de integración (se vacía en cada ejecución).
CREATE DATABASE IF NOT EXISTS matriz_ita_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON matriz_ita_test.* TO 'ita'@'%';
