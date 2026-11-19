# Equipo

El equipo son las personas y los agentes del proyecto. El selector tiene cinco secciones: Equipo, Recetas, Sesiones, Gasto y Derechos. El interruptor de agentes está en la cabecera de Equipo, de Sesiones y de Gasto: desactivado detiene cada agente e impide las ejecuciones nuevas.

Equipo se abre con las tarjetas. Personas muestra cada persona como tarjeta: el trabajo actual, la carga, el rol, los días por semana y las competencias. Agentes muestra cada rol de agente con su trabajo actual. La página muestra también el gasto del trabajo abierto y las recetas.

- Haz clic en Miembro para añadir una persona. Haz clic en una tarjeta para abrir la página de una persona.
- En la página de una persona, escribe el nombre, el identificador, los correos y las cuentas del gestor de tickets y de la plataforma de código. Elige un rol: los derechos del rol se muestran antes de guardar. Marca admin para las personas que gestionan el equipo. Quitar del equipo está en la misma página.
- Añade el admin al final: un equipo con un admin da los derechos solo a las personas del archivo.

## En vivo

El selector Tarjetas y En vivo está arriba en Equipo. En vivo muestra los agentes que trabajan. Cada fila muestra un agente, su funcionalidad con su estado, y los archivos y las specs que el agente lee y cambia. El filtro es Trabajando, Terminada, Archivos o Specs. Pasa el puntero sobre un agente para ver su ref. Haz clic derecho, o pulsa la tecla del menú contextual, para copiar la ref. Haz clic en la funcionalidad para abrir su página.

## Recetas

Una receta es la lista de pasos que un agente sigue en una funcionalidad. Recetas lista las recetas y los roles de los agentes, cada uno como tarjeta con los nombres de sus pasos. Haz clic en una tarjeta para leerla o cambiarla, y guarda. Un archivo roto muestra su error y su línea. La última versión correcta sigue en uso.

Una receta se abre en un formulario. Usa Formulario y Texto para pasar del formulario al texto YAML. Los dos editan el mismo archivo.

- Pasos: cada paso es una tarjeta con los grupos Quién, Personas, Cómo funciona y Límites. Fija el rol o la acción, el nivel de modelo, el esfuerzo, el modo, los requisitos, las herramientas y el control de cada paso. Más muestra los otros campos: espacio de trabajo, para cada, hijos en paralelo, reintentos, límite de tiempo, presupuesto, skill, contexto nuevo y rondas de revisión. Añade, quita y mueve un paso arriba o abajo.
- Límites: el tiempo de espera por bloqueo en segundos. Activa Presupuesto para detener cada ejecución en un importe en USD, y Límite de turnos para pausar cada ejecución después de un número de turnos. Los dos están desactivados por defecto.
- El formulario comprueba la receta en cada cambio. Guardar queda desactivado mientras muestra un problema.
- Nuevo crea una receta a partir de una plantilla: feature, bug, spike, docs-update, review-only, spec-split o bootstrap. El menú Más acciones de la receta abierta tiene Duplicar, Renombrar y Eliminar. Renombrar y Eliminar rechazan la receta predeterminada del proyecto y una receta que usa una ejecución. Eliminar pide confirmación.
- Un guardado desde el formulario conserva las líneas de comentario del inicio del archivo. Usa Texto para conservar otros comentarios.
- Un agente externo con las herramientas Recetas activadas (Configuración / Este ordenador, Agentes externos) puede listar, leer, comprobar y proponer una receta. Una propuesta no cambia el archivo: abre la receta, lee el diff, y luego Aplicar o Descartar.
- Escribe sin preguntar lista los permisos de una receta (consulta la página Flujo, Aprobaciones). Quitar pide confirmación y luego guarda para todo el equipo.

## Sesiones

Sesiones lista las sesiones de agente de las ejecuciones y las sesiones de este ordenador. Un agente que revisa una pull request, estima tareas o crea un mosaico se muestra allí también. Haz clic en una sesión de ejecución para abrir su funcionalidad en ese paso. Detén una sesión que no necesitas.

## Gasto

Gasto muestra los tokens y el dinero que usaron los agentes, por día y por persona, frente a los presupuestos, y la tasa de éxito de las ejecuciones.

- Presupuestos lista cada importe fijado, con su propio Editar. Sin presupuesto fijado, muestra el formulario. Haz clic en un día o en un miembro para rellenar el formulario.
- Haz clic en una ejecución para abrir su funcionalidad.
- Iteraciones cuenta las peticiones que cada ejecución envió al modelo.
- Los importes se muestran por defecto. Desactiva Mostrar precios para ocultarlos: un mosaico de dinero muestra entonces el número de tokens. La aplicación recuerda el interruptor para cada proyecto.
- Una alerta se muestra al 80 por ciento de un presupuesto.
- Una ejecución se pausa al 100 por ciento. Sube el presupuesto para seguir.

## Derechos

El archivo del equipo `.shipyard/team.yaml` lista las personas del proyecto, su rol y sus derechos. Equipo edita los miembros, y Derechos muestra los derechos de cada rol. Un proyecto sin archivo del equipo, o sin admin, da todos los derechos a cada persona.

### Roles y derechos

Cada miembro tiene un rol: Product owner, Jefe de proyecto, Arquitecto, Responsable técnico, Analista de negocio, Desarrollador, Tester, Diseñador o Lector. El rol da los derechos, la primera página y los paneles de Hoy (consulta Primeros pasos, Tu rol).

Un derecho desactiva un control. El control sigue visible, y su ayuda emergente nombra el derecho que falta y tu rol. Un lugar o una sección se oculta solo cuando el equipo no da a tu rol ningún acceso.

- `work.edit`: tickets, la lista, el tablero, el plan, estimaciones, tiempo.
- `specs.edit`: cambios de especificación, especificaciones, preguntas, planes de pruebas, reglas del proyecto.
- `design.edit`: diagramas, decisiones, API, datos, flujos de red, pantallas.
- `knowledge.edit`: guía del equipo, documentos, diapositivas, paneles.
- `code.write`: commit, push, rama, abrir una pull request.
- `code.merge`: fusionar una pull request.
- `runs.start`: iniciar, detener y reanudar una ejecución.
- `runs.approve`: aprobar lo que un agente quiere escribir, y su plan.
- `project.settings`: Configuración / Este proyecto, automatización, recetas, conexiones, el archivo del equipo.
- `costs.view`: los importes de dinero.

La marca admin da todos los derechos. Un miembro puede tener cambios: `+code.merge` añade un derecho, `-runs.approve` quita uno. Tu rol personal en Configuración / Yo y el perfil de solo lectura de un proyecto solo pueden quitar derechos.

### Quién eres

Shipyard te encuentra por la cuenta de una conexión con sesión iniciada, y luego por tu correo de git. Derechos muestra a quién encontró. Cuando el archivo del equipo tiene un admin y tú no estás en él, eres lector: puedes leer y no cambiar nada. Rellena Pedir unirse y envía la entrada copiada a un admin.

### Los derechos vienen de la rama predeterminada

Cuando el proyecto tiene un remoto, Shipyard lee los derechos del archivo del equipo de la rama predeterminada. Un cambio en tu copia de trabajo no da ningún derecho hasta que se fusiona. Derechos te avisa mientras los dos difieren. Protege la rama predeterminada en tu plataforma de código, y exige una revisión para `.shipyard/team.yaml`: Shipyard no puede detener a una persona que edita archivos con otra herramienta.

### Mover los roles de esta máquina

Si esta máquina guarda roles por correo, Derechos ofrece escribirlos como miembros. Un antiguo responsable funcional pasa a ser product owner. Un antiguo junior pasa a ser desarrollador sin `code.merge` ni `runs.approve`. Los modos de página de los perfiles antiguos se abandonan, y la lista muestra cada uno. Una persona con `project.settings` confirma.

### Auditoría

Cada escritura que necesita un derecho, y cada rechazo, añade una línea al registro de auditoría de tu máquina. Derechos muestra las últimas 100 líneas a una persona con `project.settings`.
