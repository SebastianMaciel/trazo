# Analizar un MR con trazo

Instrucciones para el agente (Claude Code u otro) al que le pidieron "con trazo analizá el MR 123 de ~/code/proyecto" o "analizá la rama X contra develop".

Vas a leer el diff, entender el cambio, escribir un análisis en JSON, validarlo con trazo hasta que pase y abrirlo en el browser. trazo dibuja el mapa y pone el código real: vos aportás la historia, los bloques, las flechas y los avisos.

En todo el procedimiento, `T` es la carpeta de trazo y `R` es la del repo a analizar (puede ser un worktree). Los comandos de trazo se corren así, desde donde estés:

```
pnpm --silent --dir T trazo <comando> ...
```

## Reglas que no se negocian

- **No toques el repo `R`**: nada de checkout, reset, stash, commits ni archivos nuevos adentro. Solo `git fetch`, y para leer código usá `git -C R show <sha>:<ruta>` y `git -C R grep -n <patrón> <sha>`. El usuario puede estar trabajando ahí.
- **Tus archivos van afuera de `R`**: el diff y el análisis van en una carpeta temporal (por ejemplo `<tmp>/trazo/<proyecto>-<mr>/`).
- **Los secretos no se escriben en ningún archivo** ni se muestran en la respuesta.
- **Si el diff supera ~3000 líneas cambiadas**, avisale al usuario el tamaño antes de analizar y preguntale si sigue.

## 1. Preparar trazo

Si `T/node_modules` no existe, `pnpm --dir T install`. Si `T/dist/web` no existe, `pnpm --dir T build`. Funciona igual en Windows, macOS y Linux: todo es Node.

## 2. Traer el MR (GitLab)

1. Con `git -C R remote get-url origin` sacá el host y la ruta del proyecto (`grupo/subgrupo/proyecto`).
2. **Datos del MR**: título, descripción, rama destino y sha del head. Con la API de GitLab:
   `GET https://<host>/api/v4/projects/<ruta url-encoded>/merge_requests/<N>` con el header `PRIVATE-TOKEN: <token>`.
   El token: el que te indique el usuario, o una variable de entorno como `GITLAB_TOKEN`. Si está instalado `glab`, sirve `glab mr view <N>`. Si no hay forma, pedile al usuario la rama destino y seguí sin descripción.
3. **Bajar el código**, sin crear ramas locales:
   ```
   git -C R fetch origin <rama-destino>
   git -C R fetch origin merge-requests/<N>/head
   git -C R rev-parse FETCH_HEAD        # sha del head del MR
   git -C R rev-parse origin/<rama-destino>   # sha de la base
   ```
   Si el remoto pide credenciales y tenés token, pasalo solo para ese comando: `git -C R -c http.extraHeader="Authorization: Basic <base64 de oauth2:TOKEN>" fetch ...`. Si el remoto es SSH, no hace falta.
   Si te pidieron una rama en vez de un MR: `git -C R fetch origin <rama>` y usá `origin/<rama>`.

La descripción del MR y el ticket que mencione (Jira u otro) son la mejor fuente para "cómo debería andar". Si hay un link a Jira y tenés acceso, leelo.

## 3. Sacar el diff numerado

```
pnpm --silent --dir T trazo diff R <sha-base> <sha-head> --out <tmp>/diff.txt
```

Imprime los shas completos de base y head: son los que van en el análisis. Leé el archivo entero (en partes si es largo). Cada hunk tiene un id (`[h7]`) y cada línea su índice dentro del hunk, su número viejo y su número nuevo:

```
[h7] @@ -24,6 +24,8 @@ export function cartTotals
  0 24 24   export function cartTotals(items: Item[]) {
  1 25    - const total = subtotal - discount;
  2    25 + const net = netFromGross(subtotal);
```

## 4. Entender el cambio

No te quedes con el diff: leé el código de alrededor en el head (`git -C R show <sha-head>:<ruta>`), quién llama a lo que cambió y qué le llega. Buscá:

- Qué hacía antes, qué hace ahora y con qué dato concreto se nota la diferencia.
- Por dónde viaja el dato: de qué función sale, en qué `if` se decide el camino, dónde termina.
- Qué puede romper: un borde (`<` vs `<=`, el último día, cero, vacío), una migración con datos viejos, algo que el ticket no pidió.

## 5. Escribir el análisis

Un JSON en `<tmp>/analisis.json`. Todo el texto, en español rioplatense, claro y corto.

### Forma

```jsonc
{
  "base": "<sha completo de la base>",
  "head": "<sha completo del head>",
  "baseLabel": "develop",                         // cómo mostrar la base
  "headLabel": "!123 feature/cupones",            // y el head: el MR y su rama
  "title": "Un solo cupón por compra, descontado antes del IVA",
  "context": {
    "before": "Cómo andaba antes, en una o dos frases.",
    "problem": "Qué salía mal, con un caso concreto y con números.",
    "goal": "Cómo debería andar. Sale de la descripción del MR o del ticket.",
    "verdict": { "status": "con-detalles", "text": "Qué tanto lo logra y qué hay que mirar." }
  },
  "groups": [{ "id": "g-entrada", "title": "Entra un solo cupón y tiene que valer", "summary": "Una frase." }],
  "blocks": [
    {
      "id": "b-active",
      "group": "g-entrada",
      "title": "isCouponActive",
      "file": "src/coupons.ts",
      "kind": "función",
      "summary": "Qué hace este pedazo y qué cambió, en una o dos frases.",
      "warnings": ["El último día el cupón ya no vale: con hoy = vencimiento devuelve false."],
      "rows": [
        { "id": "r-a-cmp", "change": "modified", "label": "vale hasta el día anterior", "before": "no miraba la fecha" }
      ],
      "hunks": [
        { "id": "h4", "notes": [{ "from": 2, "to": 3, "text": "Ojo: compara con <, el día del vencimiento queda afuera." }] }
      ]
    }
  ],
  "edges": [
    { "id": "e1", "from": "b-repo", "to": "b-active", "fromRow": "r-r-cols", "toRow": "r-a-cmp", "kind": "datos", "label": "vencimiento", "evidence": "src/coupons.ts:13" }
  ],
  "decisions": [
    {
      "id": "d-active", "from": "b-validate", "fromRow": "r-v-check",
      "condition": "¿El cupón está vigente?", "status": "nueva",
      "summary": "Si venció, corta acá con un 422.",
      "evidence": "src/api/checkout.ts:41",
      "outcomes": [
        { "id": "si", "label": "sí", "to": "b-price", "toRow": "r-p-base" },
        { "id": "no", "label": "no", "end": { "label": "responde 422", "tone": "error" } }
      ],
      "cases": [{ "input": "vence hoy", "outcome": "no", "warning": "El cliente lo ve vigente y le dice que venció." }],
      "hunk": { "id": "h9" }
    }
  ],
  "tour": ["b-checkout", "b-validate", "b-active", "b-price"]
}
```

### Cómo pensar cada parte

**context**: es la primera pantalla, para alguien que llega con la cabeza en otra cosa. `problem` siempre con un caso concreto ("una compra de $ 121.000 se cobraba $ 106.359 en vez de $ 108.900"). `verdict.status`: `resuelve`, `con-detalles` (lo resuelve pero hay que mirar algo) o `no-resuelve`. `verdict.text` nombra qué hay que mirar.

**groups**: de 3 a 7, por comportamiento, nunca por carpeta. El título dice qué cambia en palabras de negocio ("El descuento va antes del IVA"), no nombres de archivo. Van en el orden en que conviene contar la historia: la entrada, la lógica, lo que sale, lo que se guarda y al final los tests. Lo trivial (formato, renombres, textos) va en un grupo con `"minor": true`.

**blocks**: una unidad que cambió (función, componente, tipo, config, migración, test). `title` es el nombre del símbolo (`cartTotals`) o del archivo si no hay símbolo. `kind`: `endpoint`, `función`, `componente`, `tipo`, `config`, `test` o `copy`. `summary` dice el efecto, no repite el código.
- **Todo hunk va en exactamente un bloque.** Si un hunk toca dos funciones, va en la que más importa.
- **rows**: cada cosa que cambió adentro del bloque, en palabras (`"descuento sobre el neto"`, no `"discount = net * pct"`). `change`: `added`, `modified` (con `before`: lo de antes), `deleted` o `affected`.
- **affected**: una línea que no cambió pero de la que sale o a la que llega una flecha (por ejemplo, la llamada a una función que sí cambió). Si un bloque entero no cambió pero lo afecta el cambio, va con `"affected": true` y sus filas `affected`.
- **warnings**: solo riesgos reales y con el caso que rompe ("con dos cupones iguales, la migración falla"). Mejor ninguno que uno vago. Una frase cada uno.

**notes** (en cada hunk): explican rangos de líneas (`from` y `to` son los índices del diff numerado). Dicen el efecto en una o dos frases, sin repetir el código. Si hay un riesgo, la nota empieza con **"Ojo:"** y trazo la pinta en rojo. Todo hunk que no sea trivial lleva al menos una nota sobre sus líneas importantes.

**edges**: cómo se conectan los bloques. `kind`: `llama`, `importa`, `usa-tipo`, `datos` o `testea` (del test al código que prueba). `label` dice qué viaja, corto ("subtotal sin IVA"). **`fromRow` es obligatorio**: la fila de donde sale. Si la relación está en una línea que no cambió, sumale al bloque una fila `affected` para esa línea. `evidence`: `ruta/desde/la/raíz:línea` donde se ve la relación, en el head (o en la base si ya no existe).

**decisions** (rombos): los `if` que deciden a dónde va el dato y que son nuevos, cambiaron o importan para entender el cambio. No todos los `if`. `condition` como pregunta ("¿Llega al monto mínimo?"). La primera salida es el camino feliz. Una salida va a un bloque (`to`) o termina (`end` con `tone` `error` u `ok`). `cases`: datos concretos y por qué salida se van; `before` si antes se iba por otro lado, `warning` si hay algo para saber.

**tour**: todos los bloques, en el orden en que conviene leerlos. Los rombos se ubican solos después de su bloque.

**ids**: cortos y legibles (`b-cart`, `r-cart-sub`, `e3`, `d-min`). Únicos.

### Estilo

- Frases cortas. Nada de "No es X, es Y", ni rayas largas (—), ni adjetivos de relleno.
- Los nombres de código tal cual (`netFromGross`), el resto en palabras del negocio.
- Plata con símbolo y separador de miles: `$ 108.900`.

## 6. Validar hasta que pase

```
pnpm --silent --dir T trazo validate R <tmp>/analisis.json
```

Si hay problemas, los lista todos con su ruta (`blocks[3].rows: ...`). Corregilos y volvé a validar. Si a la quinta vuelta sigue fallando, mostrale los errores al usuario. Cuando pasa, imprime la clave y el link.

## 7. Abrir

Levantá el server de fondo, que si ya está corriendo no hace nada, y abrí el análisis:

```
pnpm --silent --dir T trazo serve --no-open      # de fondo
pnpm --silent --dir T trazo open <clave>
```

Al usuario contale en tres líneas: qué hace el MR, el veredicto y lo que tiene que mirar. Más el link.
