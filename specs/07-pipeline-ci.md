# SPEC 07 — Pipeline de CI

> **Estado:** Borrador
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-22
> **Objetivo:** Crear un workflow de GitHub Actions que ejecuta typecheck, reglas de dependencias, pruebas y build de backend y frontend en cada pull request y push a `main`, con un check `ci-ok` obligatorio en un ruleset que bloquea el merge si falla.

## Por qué existe esta spec

RNF-17 exige que las reglas de capas se verifiquen en CI, y hoy solo se ejecutan si alguien recuerda correr `npm run lint:deps`.
El pipeline se diseña completo desde ahora, pero solo existe el backend de SPEC 01. Los pasos de `test:db` (SPEC 02/03) y del frontend (SPEC 06) se activan solos cuando esos scripts y carpetas aparezcan, sin tocar el workflow.

## Alcance

**Incluido:**

- `.github/workflows/ci.yml`, que se dispara con `pull_request` hacia `main` y con `push` a `main`.
- Job `backend` con typecheck, `lint:deps`, pruebas, build y `test:db` (si existe), con Postgres 17 como service container.
- Job `frontend` que se salta solo si no existe `frontend/package.json`.
- Job agregador `ci-ok`, que es el único check obligatorio.
- Pasos `lint` con `--if-present` en ambos jobs, para recoger ESLint cuando llegue su spec.
- Ruleset de `main` en `.github/rulesets/main-ci.json` y script idempotente `scripts/github/aplicar-ruleset.sh`, que lo aplica con `gh api`.
- Documentación del CI y del ruleset en `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- ESLint y Prettier (el CI los ejecutará con `--if-present` cuando existan).
- PR obligatorio para todos, que se descartó. El push directo a `main` lo puede hacer quien tenga bypass.
- Protección contra force push y borrado de `main`, que se descartó en esta spec.
- Despliegue (CD), imágenes Docker y publicación de artefactos.
- Cobertura mínima como check (RNF-18), escaneo de seguridad (RNF-10), auditoría de dependencias y Dependabot.
- Matriz de varias versiones de Node.

## Modelo de datos

Esta spec no introduce datos de la aplicación. Introduce configuración de GitHub:

### Archivos

```text
.github/
  workflows/ci.yml
  rulesets/main-ci.json
scripts/github/aplicar-ruleset.sh
CLAUDE.md
```

### Workflow `ci.yml`

| Elemento | Valor |
| --- | --- |
| `name` | `CI` |
| Disparadores | `pull_request` con `branches: [main]`; `push` con `branches: [main]` |
| `permissions` | `contents: read` |
| `concurrency` | grupo `ci-${{ github.ref }}`, `cancel-in-progress: true` |
| Runner | `ubuntu-latest` |
| Node | `22`, con `actions/setup-node` y caché de npm por `package-lock.json` |
| Acciones | `actions/checkout` y `actions/setup-node` fijadas a su versión mayor vigente al implementar |

**Job `backend`** (`working-directory: backend`):

- Service `postgres`: imagen `postgres:17-alpine`, con `POSTGRES_USER=vozmuni`, `POSTGRES_PASSWORD=vozmuni` y `POSTGRES_DB=vozmuni_test`. Publica el puerto `5432` y usa un health check con `pg_isready`.
- Variables de entorno: `DATABASE_URL_TEST=postgres://vozmuni:vozmuni@localhost:5432/vozmuni_test` y `DATABASE_URL` con el mismo valor.
- Pasos, en orden:
  1. `npm ci`
  2. `npm run typecheck`
  3. `npm run lint:deps`
  4. `npm run lint --if-present`
  5. `npm test`
  6. `npm run build`
  7. `npm run test:db --if-present`

**Job `frontend`** (`working-directory: frontend`):

1. El paso `detectar` comprueba si existe `frontend/package.json` y publica la salida `existe=true|false`.
2. Todos los pasos siguientes tienen `if: steps.detectar.outputs.existe == 'true'`:
   - `actions/setup-node` con caché.
   - `npm ci`
   - `npm run typecheck --if-present`
   - `npm run lint:deps --if-present`
   - `npm run lint --if-present`
   - `npm test`
   - `npm run build`

Sin `frontend/`, el job termina en verde y deja los pasos marcados como saltados.

**Job `ci-ok`:**

- `needs: [backend, frontend]` e `if: always()`.
- Un solo paso que falla si algún resultado de `needs` es distinto de `success`.

### Ruleset `main-ci.json`

```json
{
  "name": "main-ci",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
  ],
  "rules": [
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "ci-ok" }]
      }
    }
  ]
}
```

`actor_id: 5` es el rol **Repository admin**. Con este ruleset:

- Keily, como dueña del repositorio, puede hacer push directo a `main` y mergear sin esperar los checks.
- Cualquier otro colaborador necesita un PR con `ci-ok` en verde.

### Script `aplicar-ruleset.sh`

- Recibe el repositorio como argumento, con valor por defecto `KeilyLopezCodes/voz-muni`.
- Busca un ruleset llamado `main-ci` con `gh api repos/<repo>/rulesets`.
- Si existe, lo actualiza con `PUT repos/<repo>/rulesets/<id>`. Si no existe, lo crea con `POST repos/<repo>/rulesets`. En ambos casos usa `--input .github/rulesets/main-ci.json`.
- Si `gh` no tiene sesión o la cuenta no es admin del repositorio, termina con código distinto de 0 y un mensaje que lo dice.
- Antes de aplicar, muestra la cuenta activa (`gh api user --jq .login`).

## Plan de implementación

1. Crear `.github/workflows/ci.yml` con los disparadores, `permissions`, `concurrency` y el job `backend` sin service ni `test:db`: `npm ci`, typecheck, `lint:deps`, `lint --if-present`, `test` y `build`. Verificación: hacer push de la rama `spec-07-pipeline-ci` y abrir un PR hacia `main`. El job `backend` termina en verde.
2. Agregar al job `backend` el service `postgres`, las variables de entorno y el paso `npm run test:db --if-present`. Verificación: el PR sigue en verde y el log muestra que `test:db` no se ejecutó porque el script no existe todavía.
3. Agregar el job `frontend` con el paso `detectar` y los pasos condicionales. Verificación: el job termina en verde y sus pasos aparecen como saltados.
4. Agregar el job `ci-ok`. Verificación: `ci-ok` termina en verde. Luego se sube a la rama un commit temporal que rompe una prueba de `tests/unit/health.service.test.ts`, y `backend` y `ci-ok` quedan en rojo. Al revertir el commit vuelven a verde.
5. Crear `.github/rulesets/main-ci.json` y `scripts/github/aplicar-ruleset.sh`. Verificación: con `gh` iniciado como `KeilyLopezCodes`, el script crea el ruleset. Una segunda ejecución lo actualiza y no lo duplica. `gh api repos/KeilyLopezCodes/voz-muni/rulesets` lista un solo `main-ci`.
6. Actualizar `CLAUDE.md` con una sección "CI" que explique:
   - Qué ejecuta cada job.
   - Que `ci-ok` es el único check obligatorio.
   - Cómo aplicar el ruleset y quién tiene bypass.
   - Que los scripts nuevos llamados `test:db`, `lint`, `typecheck` o `lint:deps` se ejecutan solos en CI.
   - Que un job nuevo debe agregarse a `needs` de `ci-ok`.

## Criterios de aceptación

- [ ] Abrir un PR hacia `main` dispara el workflow `CI` con los jobs `backend`, `frontend` y `ci-ok`.
- [ ] Un push a `main` dispara el workflow `CI`.
- [ ] Con el repositorio actual (sin `frontend/` y sin `test:db`), los tres jobs terminan en verde.
- [ ] En el job `backend` se ejecutan `npm ci`, `typecheck`, `lint:deps`, `test` y `build`, en ese orden.
- [ ] Un PR con una prueba unitaria rota deja `backend` y `ci-ok` en rojo.
- [ ] Un PR con un import de `express` dentro de `src/domain/` deja `backend` en rojo en el paso `lint:deps`.
- [ ] Un segundo push al mismo PR cancela la ejecución anterior que seguía en curso.
- [ ] Después de ejecutar el script, `main` tiene un único ruleset `main-ci` activo, con `ci-ok` como check obligatorio y bypass `always` para el rol admin.
- [ ] Ejecutar el script dos veces deja un solo ruleset `main-ci`.
- [ ] Ejecutar el script con una cuenta sin permisos de admin termina con código distinto de 0 y un mensaje claro.
- [ ] En un PR con `ci-ok` en rojo, GitHub marca `ci-ok` como **Required** y no habilita el merge normal. Solo ofrece el bypass a admins.
- [ ] El workflow declara `permissions: contents: read` y no usa secretos.
- [ ] `CLAUDE.md` documenta el CI, el ruleset y cómo agregar jobs.

## Decisiones

- **Sí:** GitHub Actions. El remoto está en GitHub y el repositorio es público, así que los minutos y los rulesets son gratuitos.
- **Sí:** pipeline completo que se activa solo, con `--if-present` y un job `frontend` que detecta la carpeta. Las SPEC 02, 03 y 06 quedan cubiertas sin editar el workflow.
- **No:** cubrir solo lo que existe hoy y obligar a cada spec a tocar el workflow.
- **Sí:** el service `postgres` arranca siempre en el job `backend`, aunque `test:db` todavía no exista. Cuesta unos segundos y evita lógica condicional sobre services.
- **Sí:** la base del service se llama `vozmuni_test` directamente. En CI no hay script de inicialización, a diferencia del docker-compose de SPEC 02.
- **Sí:** "lint" significa `typecheck` + `lint:deps`, más `lint --if-present` para el futuro ESLint.
- **No:** agregar ESLint en esta spec.
- **Sí:** checks requeridos con bypass para admins. Keily mantiene el flujo actual (merge local y push a `main`), y cualquier otro colaborador pasa por PR.
- **No:** PR obligatorio para todos.
- **Sí:** el bypass es necesario porque la regla `required_status_checks` de un ruleset también rechaza los push directos con commits que no pasaron los checks.
- **Sí:** un único check obligatorio, `ci-ok`, como job agregador. Agregar o renombrar jobs no exige tocar el ruleset, y un job saltado no deja el check pendiente.
- **No:** cada job como check obligatorio.
- **Sí:** `strict_required_status_checks_policy: false`. No obliga a actualizar la rama del PR con `main` antes de mergear, y con un solo desarrollador sería fricción.
- **Sí:** Node 22, la versión mínima de `engines`.
- **No:** matriz 22 y 24.
- **Sí:** sin filtros por ruta. Todo PR ejecuta todo. Con un repositorio pequeño cuesta poco y evita checks requeridos que nunca se reportan.
- **Sí:** `concurrency` con `cancel-in-progress`. Un push nuevo al PR cancela la ejecución anterior.
- **Sí:** ruleset como JSON versionado más un script `gh api` idempotente. La configuración queda revisable en el repositorio.
- **No:** solo pasos manuales en la interfaz web.
- **Sí:** el script lo ejecuta Keily. `gh` en esta máquina tiene sesión como `cralitos`, sin permisos de admin en `KeilyLopezCodes/voz-muni`.
- **No:** reglas contra force push y borrado de `main` (decisión del usuario).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Keily, con bypass, hace push directo a `main` con el CI roto | El workflow también corre en `push` a `main`, así que el fallo queda visible en el commit. La disciplina de abrir PR queda documentada. |
| Sin regla contra force push, un `push --force` a `main` reescribe el historial publicado | Es una decisión explícita de esta spec. Se puede agregar `non_fast_forward` al JSON y volver a ejecutar el script. |
| Se agrega un job nuevo y se olvida en `needs` de `ci-ok`, así que puede fallar sin bloquear | `CLAUDE.md` lo documenta. Revisar `needs` forma parte de la revisión del PR que agrega el job. |
| `--if-present` oculta que un script se renombró (por ejemplo `test:db` → `test:database`) | Las specs que introducen esos scripts conservan los nombres documentados en `CLAUDE.md`. |
| El script se ejecuta con la cuenta equivocada | El script muestra la cuenta activa antes de aplicar y falla si no tiene permisos de admin. |
| Vitest en modo watch bloquea el CI | Vitest detecta `CI=true` (que GitHub Actions define) y ejecuta una sola vez. La SPEC 06 debe mantener `npm test` sin `--watch`. |

## Lo que **no** está en esta spec

- ESLint y Prettier.
- PR obligatorio para todos.
- Protección contra force push y borrado de `main`.
- Despliegue, Docker y artefactos.
- Cobertura mínima, escaneo de seguridad y Dependabot.
- Matriz de versiones de Node.

Cada uno de estos temas, cuando llegue, va en su propia spec.
