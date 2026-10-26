# Trazo

Code review visual y guiado. En vez de leer un diff de 2000 líneas, recorrés un mapa de bloques de comportamiento conectados, y bajás al código solo donde hace falta.

## Problema

Con AI se escribe código mucho más rápido de lo que se puede revisar. Nadie lee línea por línea un PR de 40 archivos, se aprueba "a fe". El diff ordenado por archivo no cuenta la historia del cambio: lo que va junto queda desparramado y lo trivial pesa igual que lo crítico.

## Qué es el MVP

Un CLI que corrés adentro de un repo. Elegís una rama (o worktree) contra la base, Claude Code analiza el diff y se abre una web local con:

- **Mapa** (canvas infinito, pan + zoom): bloques de cambio agrupados por comportamiento, con flechas entre bloques relacionados aunque estén en archivos distintos.
- **Panel de detalle** al costado: el diff real del bloque seleccionado, antes y después, y la explicación de qué cambió y por qué importa.
- **Recorrido guiado**: anterior/siguiente en el orden que propone la AI. La cámara viaja al bloque y el panel se actualiza. Podés salirte y explorar libre cuando quieras.
- **Tildes**: marcás cada bloque como entendido. Arriba se ve el progreso ("7 de 12").

### Zoom en 3 niveles

1. **Intención**: grupos grandes con título ("Validación de saldo antes de transferir").
2. **Flujo**: los bloques de cada grupo y las flechas entre ellos.
3. **Código**: el bloque muestra el resumen de líneas cambiadas, y el panel tiene el diff completo.

### Dirección visual

Referencias: un visor de JSON tipo grafo (cards con filas, conectores curvos) y un explorador de clases con foco en un nodo.

- **Fondo oscuro azul noche**, con grilla de puntos sutil para que el canvas se sienta infinito.
- **Bloque = card con filas.** Header con el nombre y un chip del tipo (función, componente, tipo, config). Cada fila es una unidad cambiada (función, prop, campo) y se pinta según qué le pasó: agregada, modificada (lo viejo tachado al lado de lo nuevo) o borrada.
- **Las flechas salen de la fila exacta**, no del borde de la card. Son curvas y llevan una etiqueta chica con la relación (`llama`, `importa`, `order.customer`).
- **Camino activo resaltado en ámbar**: el bloque seleccionado y sus vecinos directos quedan con borde y flecha encendidos, el resto se apaga. Lo apagado se sigue leyendo, nada de texto gris sobre gris (contraste AA mínimo).
- **Minimapa** abajo a la izquierda con el rectángulo de lo que estás viendo.
- **Sidebar a la izquierda con árbol filtrable** grupo → bloque → fila, con punto de color en lo cambiado y lo tildado. Click en un ítem y la cámara viaja hasta ahí. Le da al mapa un índice que se puede leer en orden.
- **Layout jerárquico de izquierda a derecha** (sigue el flujo de datos). Nada de grafo por fuerzas: con 30 archivos queda una telaraña.

## Scope

**Entra**
- Repo git local, rama o worktree contra rama base (default: `main`, configurable).
- Análisis con `claude -p` y salida JSON validada con schema.
- Mapa + panel de detalle en una sola ventana, con el divisor redimensionable.
- Recorrido guiado y exploración libre.
- Tildes por bloque, persistidos localmente por par de commits.
- Cambios triviales (copy, renames, formato) agrupados en un bloque "menores" sin flechas.
- Cache del análisis por `base_sha..head_sha`: reabrir el mismo diff no vuelve a llamar a la AI.

**No entra (backlog)**
- Dos ventanas sincronizadas (BroadcastChannel). La arquitectura lo deja preparado.
- PRs de GitHub y MRs de GitLab vía API.
- Ejecución de código y animación de input → output.
- Correr tests o checks y vincular sus resultados al mapa.
- Preguntarle a la AI sobre un bloque desde la UI.
- Comentarios que se publiquen en el PR.
- Otros lenguajes además de TS/JS (el análisis puede andar con cualquiera, pero se prueba con TS).

## Próximo caso de prueba: la AI como reviewer

Cuando terminemos de afinar la UI con el happy path, el siguiente caso es que la AI haga un code review de verdad antes de armar el mapa. Para eso lee:

- El código de origen (cómo estaba), los cambios y hacia dónde fluye cada dato.
- El ticket de Jira y el contexto que haya (descripción, criterios de aceptación, comentarios).

Y marca en el mapa, sobre el bloque o la flecha que corresponda:

- **Lo que rompería algo:** "con este input, esto devuelve X y antes devolvía Y".
- **Lo que no se alinea con el ticket:** el ticket pide A y el cambio hace B, o hace A y además algo que nadie pidió.
- **Sugerencias,** como mínimo resaltadas, aunque no proponga el código.

Caso de prueba: la rama `fix/redondeo-mezclado` del repo demo, que tiene una rotura escondida (`count < MAX_INSTALLMENTS` deja afuera las 12 cuotas) mezclada con cambios legítimos. Hay que escribirle un ticket que pida solo el arreglo del IVA.

## Backlog de UI

- **"Tengo dudas" con texto:** un campito para escribir la duda. Junto con el bloque y su evidencia (archivo:línea) queda un comentario listo para mandarle al autor, o para publicar en el MR más adelante.

## Decisiones

| Decisión | Elegido | Por qué / trade-off |
|---|---|---|
| Runtime | CLI local + web en localhost | Lee git directo, el código no pasa por ningún server propio. Para compartir hay que instalar. |
| Motor AI | `claude -p` headless | Usa la suscripción, puede leer el repo para tener contexto. Depende de tener Claude Code instalado y logueado. Es lento (decenas de segundos) y por eso va el cache. |
| Front | Vite + React + TS | No hay SSR ni deploy, Next.js sobra. |
| Canvas | React Flow (xyflow) | Pan, zoom, nodos custom y edges resueltos. |
| Layout | ELK (elkjs) | Layout automático con grupos anidados, que es justo lo de intención → bloques. |
| Código | Shiki | Highlight exacto, mismo motor que VS Code. |
| Server | Node + Hono | Chico, sirve la UI y expone `/api/diff`, `/api/analysis`. |
| Estado | Store único (Zustand) con la selección separada de la UI | Pasar a 2 ventanas es sincronizar ese store por BroadcastChannel, sin tocar componentes. |

### Contrato con la AI

`claude -p` recibe el diff + acceso de lectura al repo y devuelve:

- `groups[]`: id, título de intención y resumen de una línea.
- `blocks[]`: id, group, título, explicación corta, `hunks[]` (archivo + rango de líneas del diff) y nivel de riesgo (bajo/medio/alto).
- `hunks[].notes[]`: notas que explican grupos de líneas seguidas (rango + texto de una o dos frases). Dicen el efecto, no repiten el código, y marcan el riesgo si lo hay. Se muestran al lado del código: nadie lee código pelado.
- `edges[]`: from, to, tipo (`llama`, `importa`, `usa-tipo`, `flujo-de-datos`) y **evidencia** (archivo:línea).
- `decisions[]`: los puntos donde el flujo se divide (un `if` que decide a dónde va el dato). Cada uno lleva condición, estado (`nueva` / `cambió` / `igual`), salidas (a otro bloque o a un final, como "responde 400"), casos de ejemplo con el camino que toma cada uno y evidencia (archivo:línea del `if`).
- `tour[]`: orden sugerido de bloques. Se respeta dentro de cada nivel del flujo: nada aparece antes de lo que le pasa datos.

Reglas que valida el server (no la AI):
- Todo hunk del diff pertenece a exactamente un bloque. Si alguno queda huérfano, va a "sin clasificar" (nunca desaparece código del review).
- Un edge o una decisión sin evidencia, o con evidencia que no existe en el archivo, se descarta.
- Si el JSON no cumple el schema, se reintenta una vez y si vuelve a fallar se muestra el error.

## Criterios de terminado

1. `pnpm dlx trazo` (o `pnpm start` en dev) adentro de un repo lista ramas, elijo una y se abre el mapa.
2. El 100% de las líneas del diff aparecen en algún bloque (lo valida un test).
3. Las flechas conectan bloques de archivos distintos y cada una muestra su evidencia al seleccionarla.
4. Zoom out: veo los grupos con título. Zoom in: veo bloques y flechas. Click en bloque: el panel muestra su diff.
5. El recorrido guiado lleva la cámara bloque por bloque y se puede cortar en cualquier momento.
6. Tildes persistentes: cierro, reabro el mismo diff y siguen ahí, sin volver a llamar a la AI.
7. Mientras analiza hay progreso visible. Si `claude` no está instalado, falla o devuelve basura, se ve un error claro con qué hacer.
8. Un PR real de ~30 archivos se entiende más rápido en el mapa que leyendo el diff (prueba subjetiva con un MR del laburo).

## Validación

- **Unit**: parser del diff, validador del contrato (hunks huérfanos, edges sin evidencia, schema roto) y clave de cache.
- **Fixture**: un repo de ejemplo con una rama de cambios conocida y una respuesta de AI grabada, así los tests no llaman a `claude`.
- **E2E (Playwright)**: abrir, navegar el mapa, recorrido, tildar, recargar y verificar persistencia.
- **Real**: correrlo contra 2 o 3 ramas de proyectos propios y contra un MR de laburo.

## Robustez

- **Atomicidad**: el análisis se guarda en cache solo si pasó la validación completa. No queda nunca un mapa a medias.
- **Idempotencia**: misma clave `base_sha..head_sha` devuelve el mismo análisis. Si la rama avanza (cambia el head), es otro análisis y los tildes viejos no se arrastran.
- **Concurrencia**: un solo análisis en curso por clave. Si pedís el mismo dos veces, la segunda espera a la primera.
- **Seguridad**: el server escucha solo en `127.0.0.1`. Lee el repo, no escribe nada en él. Los nombres de rama se validan contra `git branch` antes de pasarlos a un comando.
- **Feedback**: cada paso (leer diff, analizar, validar) informa en la UI si salió bien o mal.
- **Tamaño**: arriba de cierto tamaño de diff (a calibrar, arranco con ~3000 líneas) se avisa antes de analizar, porque tarda y consume.
- **Fuera de alcance consciente**: auth (es local, mono usuario) y multi-tenant (no aplica).
