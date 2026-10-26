# trazo

> **Si sos un agente y te pidieron analizar un MR o una rama con trazo, seguí [ANALIZAR.md](ANALIZAR.md).**

Review visual de un MR: en vez de leer el diff archivo por archivo, recorrés un mapa de bloques conectados por cómo viaja el dato, con un recorrido guiado y un veredicto por paso. Al final te deja el texto de la review listo para pegar.

## Usarlo

1. Una vez: `git clone` de este repo y `pnpm install && pnpm build` adentro.
2. Abrí Claude Code donde trabajás y pedile algo así:

   > con ~/code/trazo analizá el MR 123 de ~/code/mi-proyecto

3. Claude baja el MR, lo analiza, lo valida y te abre el mapa en `http://127.0.0.1:4319`.

Los análisis quedan guardados en `~/.cache/trazo`, uno por par de commits: reabrirlos es instantáneo y tus veredictos siguen ahí. trazo no escribe nada en el repo que revisa.

## Desarrollo

- `pnpm dev`: server y web con recarga.
- `pnpm test`, `pnpm typecheck`, `pnpm build`.
- [SPEC.md](SPEC.md): qué es, decisiones y backlog.
