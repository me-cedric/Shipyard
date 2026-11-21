# Flujo

Flujo muestra cada funcionalidad una vez, de la idea a la fusión. Una funcionalidad une un ticket del gestor de tickets, un cambio de especificación, el trabajo de un agente y una pull request. La aplicación guarda una copia de los tickets, así que Flujo se abre también sin red.

El selector tiene cuatro secciones: Flujo, Lista, Hecho y Salud. Flujo es el tablero. Tiene cinco etapas:

| Etapa | Qué hay |
|---|---|
| Idea | Un ticket sin trabajo, o un cambio de especificación que solo tiene su propuesta. |
| Spec | Un cambio de especificación en curso, o una ejecución que espera, planifica o tiene su plan en revisión. |
| Construcción | Un agente trabaja o revisa su propio trabajo. Una ejecución fallida o cancelada queda aquí, marcada como detenida. |
| Revisión | La pull request está abierta, o hay cambios solicitados. |
| Listo | La pull request está fusionada, o la ejecución está terminada. |

Una tarjeta muestra el título, quién trabaja en la funcionalidad y su estado. Una tarjeta que te espera tiene el color de atención. Haz clic en una tarjeta para abrir la página de la funcionalidad. El menú de una tarjeta tiene Detener, el historial y Mover a un estado del gestor de tickets. Cuando el gestor de tickets rechaza el movimiento, la tarjeta muestra el motivo.

La barra sobre el tablero contiene el filtro Todo, Me necesita o Mío, Nuevo y Más. El filtro queda en la dirección.

Más contiene:

- Buscar una funcionalidad: abre el campo de búsqueda. Encuentra una funcionalidad por la clave de su ticket o por su título. El texto queda en la dirección.
- Empezar desde un ticket: abre Funcionalidad nueva en su lista de tickets.
- Agentes activos: el interruptor de agentes. Desactivado detiene cada agente e impide las ejecuciones nuevas. Actívalo de nuevo para seguir.

## Funcionalidad nueva

Nuevo abre una página propia, con un enlace de vuelta al tablero y una pregunta: ¿Qué quiere construir?

1. Escribe el título.
2. Elige el tipo: Función, Error o Idea para más tarde. Una idea crea solo el cambio de especificación.
3. Elige la manera: Un agente escribe la especificación, Yo escribo la especificación, o Construir ya, sin especificación.
4. Haz clic en Crear.

Añadir un documento está junto a los tipos. Acepta un archivo Markdown, PDF o Word, hasta 20 MiB, y la página rechaza otro tipo. Crear copia cada documento en la carpeta `inputs` del cambio, como entrada para quien escribe la especificación. Límite está junto a la receta, para las vías que crean un ticket. Es lo máximo que pueden gastar todas las ejecuciones de la funcionalidad, en dólares. Va a `.shipyard/automation.yaml` con la clave del ticket.

O empieza desde un ticket, bajo las tres maneras: busca un ticket sin ejecución y haz clic en Iniciar un agente. Empezar desde un ticket, en Más de Flujo, la abre.

Cada manera crea primero un cambio de especificación con tu texto como título. Una manera está desactivada cuando te falta el derecho que necesita.

## Lista

Lista muestra las mismas funcionalidades en una tabla: el título, la etapa, quién y el estado. También contiene los controles de los tickets:

- Las píldoras Responsable, Etiqueta y Agente filtran las filas. Trae un ticket por su clave.
- En Más: el filtro por estado e Importar. La aplicación muestra primero el número. No escribe nada antes de tu confirmación.
- Asignar: elige una persona. La aplicación propone una persona según las competencias y el tiempo libre. La elección es tuya.
- Marcar para el agente: un clic da el ticket a los agentes.
- Nuevo cambio, en Más, empieza un cambio de especificación. Dale un título sencillo: la aplicación crea el identificador a partir del título. Desde un ticket crea el cambio con el título del ticket, pone el texto del ticket en la propuesta y te lleva a la rama `specs/<id>`, para que el cambio quede aparte del código.

## Hecho

Hecho contiene las funcionalidades listas y el historial de las ejecuciones: cada ejecución terminada y cada ejecución anterior de un ticket, el final más reciente primero. Buscar una funcionalidad terminada tiene su propio campo en Hecho. Más añade o quita columnas. Haz clic en una fila para abrir su funcionalidad. La última ejecución fallida de un ticket queda también en el tablero, con Reintentar.

## La página de una funcionalidad

Cada funcionalidad tiene una página, `/flow/feature/<id>`. El identificador es la ref de una de sus partes: el ticket, el cambio de especificación, la ejecución o la pull request. La página muestra el título, la línea de etapas y un selector de seis secciones: Historia, Encargo, Diseño, Cambios, Controles y Charla. Más contiene Abrir en el gestor de tickets, Copiar referencia y, en una funcionalidad detenida, Qué pasó. Atrás vuelve a Flujo con su búsqueda y su filtro, y Escape hace lo mismo. Un enlace a una ejecución o a una pull request abre esta página en la sección de esa parte.

### Historia

Historia muestra primero lo que te espera: las preguntas, las aprobaciones, el plan con sus acciones, y el motivo por el que un agente se detuvo con su única acción. El plan en revisión es una sola tarjeta: los pasos, los archivos que el plan cambia, lo que el agente hace solo y lo que pregunta primero. Aprueba el plan, o escribe lo que hay que cambiar y haz clic en Devolver. Después lista los eventos en frases sencillas. Qué pasó abre el registro completo, donde Importantes muestra las preguntas, los errores, los cambios de estado y los resultados, y Todos muestra cada evento. Peticiones y sesiones muestra las peticiones con su coste, el grafo de la receta y las sesiones. Seguir muestra una sesión en vivo. Abrir en el terminal reanuda una sesión terminada.

La página del ticket se abre con Editar en el menú de una tarjeta. Muestra el ticket con título y texto editables, sus datos, sus comentarios y la marca de la sincronización con el gestor de tickets. Atrás vuelve a la funcionalidad.

La columna lateral muestra el agente (la herramienta de IA, el modelo, el paso n de m, el coste y el presupuesto, el tiempo transcurrido, con Hablar y Detener), el encargo, los cambios y las personas. Una funcionalidad sin agente tiene Iniciar un agente.

### Encargo

Encargo muestra los datos del ticket y el cambio de especificación de la funcionalidad como tarjetas de requisito, cada una con su prueba, y los tickets de la funcionalidad. Los archivos del cambio se abren en una página propia, con un enlace de vuelta a Encargo. Un formulario muestra cada parte del cambio con su estado: falta, borrador o terminada. También hay una vista de texto sin formato. Haz clic en Validar: cada problema se muestra en su parte, con su línea. Sigue el paso siguiente que la aplicación muestra, por ejemplo dividir el trabajo en tickets. Un cambio toma su título del primer encabezado de su propuesta. El identificador sigue siendo el nombre de la carpeta. Una funcionalidad sin especificación tiene Escribir la spec.

### Diseño

Diseño lista las decisiones, los diagramas, las pantallas, los contratos de API y los modelos de datos que citan una parte de la funcionalidad.

### Cambios

Cambios muestra la pull request de la funcionalidad. Los archivos modificados se abren en una página propia: Archivos modificados, con el árbol de archivos, el número de archivos vistos y un enlace de vuelta a Cambios.

La cabecera de la pull request muestra el título, el estado, la rama de origen y la de destino y las líneas añadidas y quitadas. El menú junto al estado abre la pull request en el navegador, copia su ref y la cierra. Un borrador tiene Marcar como listo.

El cuadro de fusión dice en una línea si la pull request se puede fusionar, y si no, por qué. Siguen tres segmentos: los controles (superados, fallidos y pendientes), los comentarios (los hilos sin resolver del total) y las aprobaciones (los revisores que aprobaron, con el veredicto de cada uno). El botón Fusionar es un botón doble. Haz clic en Fusionar y confirma. La confirmación nombra el método de fusión y tiene Cancelar. La flecha abre los métodos (Merge, Squash, Rebase) cuando la plataforma de código ofrece más de uno. Fusionar está desactivado cuando la pull request es un borrador, está cerrada o fusionada, cuando te falta el derecho de fusionar, o cuando la plataforma de código la bloquea. Los controles fallidos o los cambios solicitados no desactivan Fusionar: la confirmación nombra entonces ese riesgo.

La columna estrecha muestra los revisores con sus veredictos, los tickets y las ejecuciones enlazados, y los elementos que citan la pull request.

Archivos: cada archivo empieza plegado, con su ruta, su estado y sus líneas añadidas y quitadas. Haz clic en un archivo para leer su diff. El árbol de la izquierda tiene un filtro. Desplegar todo abre los 30 primeros archivos que coinciden con el filtro, y luego la acción dice «Desplegar los 30 siguientes». Marca la casilla de un archivo para marcarlo como visto. El número de archivos vistos queda en este ordenador, para esta pull request y este commit de cabeza.

Comentarios en líneas: el «+» en el margen de una línea añade un comentario a esa línea. Se muestra en las líneas que la pull request añadió o dejó igual, nunca en las líneas quitadas. Añadir a la revisión añade el comentario a tu revisión pendiente. Publicar solo este comentario lo publica enseguida. La revisión pendiente queda en este ordenador hasta que la envías o la descartas, y sobrevive a un reinicio. Enviar revisión abre un diálogo: elige Comentar, Aprobar o Solicitar cambios. Solicitar cambios necesita un texto de revisión. Una revisión acepta 100 comentarios como máximo.

Un comentario que la plataforma de código no puede colocar en una línea va al texto de la revisión, y un aviso dice cuántos. Cuando la plataforma de código publica solo una parte de la revisión, la página conserva los otros comentarios como pendientes. Azure DevOps pone cada comentario en el texto de la revisión, con su archivo y su línea. Las respuestas, Resolver, el «+», Enviar revisión y Comentar necesitan el derecho de escribir en la plataforma de código. Sin él, cada control está desactivado y dice por qué.

Límites: GitHub y GitLab listan hasta 3000 archivos. Un hilo muestra sus últimos 50 comentarios. Los hilos de revisión de GitLab muestran los 100 primeros. La aplicación no guarda el autor de una pull request.

Revisión por un agente:

1. Haz clic en Revisar con un agente en una pull request abierta. Un agente lee los cambios en el commit de cabeza, en una copia de solo lectura. La revisión es un borrador: un resumen, un veredicto y hallazgos en sus líneas del diff.
2. Edita el resumen y el veredicto, haz clic en Eliminar en un hallazgo que no quieres, y haz clic en Publicar revisión. Una revisión se publica una vez.
3. En Configuración / Este proyecto, elige la revisión por un agente de cada pull request: Desactivada, Borrador o Publicar. Publicar añade una revisión en comentario y nunca aprueba.

Una revisión por un agente se muestra en Equipo / Sesiones, donde Detener la termina. Cuenta en el límite de agentes y en el presupuesto del proyecto. Un proyecto de solo lectura la rechaza.

### Controles

Controles muestra los pasos de control de la ejecución, los controles de la pull request con el estado de la CI, el plan de pruebas, las docs que este cambio deja obsoletas y la fila Impactos en el resto del código. Corregir con un agente pide a un agente que corrija los controles que fallan.

### Charla

Charla tiene un botón + junto al campo de mensaje. Copia un archivo como contexto en la carpeta de la ejecución: el siguiente turno del agente lo lee. Un archivo de texto llega hasta 200 KiB y una imagen hasta 2 MiB, y la charla dice qué límite rompe un archivo mayor. Pausar está en la tarjeta Agente, entre Hablar y Detener. El agente termina su turno, luego la ejecución queda en pausa por una persona, conserva su lugar en los límites y espera Reanudar. Charla muestra la conversación de la sesión del agente (el terminal en vivo y las peticiones están en Para desarrolladores), la conversación de la pull request y los comentarios del ticket. La conversación de la pull request lista los comentarios generales y los hilos de revisión en orden de tiempo. Haz clic en Responder para responder a un hilo, en Resolver para cerrarlo y en Reabrir para abrirlo de nuevo. El cuadro de escritura tiene Escribir y Vista previa. Comentar publica un comentario general. Devolver al agente se muestra para una pull request que abrió una ejecución.

## Aprobaciones

Las aprobaciones de una ejecución son una sola pregunta que nombra cada efecto.

- El botón principal aprueba cada efecto.
- Paso a paso abre la lista donde apruebas o rechazas un solo efecto.
- Todavía no mueve la pregunta a Más tarde y no decide nada.
- No volver a preguntar por esta receta permite exactamente los tipos de escritura mostrados para esa receta. Un push que reescribe el historial nunca forma parte. Una escritura que ya espera conserva su pregunta: el permiso vale para las escrituras siguientes.

Equipo / Recetas y Configuración / Este proyecto listan los permisos de cada receta, con Quitar.

## Cuando un agente se detiene

Una ejecución corrige primero sus propios problemas. Un hallazgo que bloquea, un control en rojo, un conflicto o una rama vacía inicia una ronda de corrección sin clic. Las rondas están limitadas: 3 intentos fallidos por paso, 3 rondas de comentarios y 8 rondas de corrección por ejecución. El mismo fallo dos veces seguidas detiene la ejecución enseguida.

Después la ejecución se detiene, y la funcionalidad te espera. La página dice el estado en palabras sencillas, la causa en una frase y lo que la ejecución intentó, con una acción principal. Hoy y la barra Preguntar dan la misma acción. La ejecución escribe también el mismo texto como comentario en el ticket, y el ticket recibe la etiqueta `shipyard:blocked`.

| Acción | Cuándo |
|---|---|
| Responder | El agente hizo una pregunta. |
| Desbloquear | La ejecución está bloqueada. Escribe un mensaje: la ejecución recibe una ronda más y lo lee. |
| Añadir presupuesto | La ejecución gastó su presupuesto o sus turnos. Sube el presupuesto, y la ejecución sigue. |
| Reanudar | La ejecución está en pausa. |
| Tomar el control | La ejecución está bloqueada. Termina como cancelada con el motivo «Tomada por» y tu nombre, la rama y el worktree se quedan, el ticket es tuyo y el worktree se abre en tu editor. |
| Reintentar | La ejecución falló o se canceló. Empieza una ejecución nueva. |
| Cerrar como terminada | La ejecución no cambió ningún archivo y el trabajo ya está hecho. |

Una respuesta de un miembro del equipo en el ticket también desbloquea la ejecución. Mientras el archivo del equipo no nombra ningún admin, cualquier respuesta cuenta: en un gestor de tickets público, nombra un admin. Una pausa por el presupuesto del día no tiene acción: termina sola en la primera sincronización del día siguiente. Una ejecución terminada no empieza de nuevo por sí sola.

## Salud

Salud muestra la salud del producto: los controles del proyecto y los escáneres de seguridad. Cada rol la ve. Una persona sin derecho sobre el código ve los pasos de control con su estado, y Ejecutar, Configurar, el terminal e Instalar están desactivados. El título dice cuántos pasos de control necesitan una corrección.

Un control empieza después de tu clic. Mientras se ejecuta, la tarjeta muestra En curso, el tiempo que avanza y las últimas líneas de la salida. Sigue cuando sales de la página. Abrir en el terminal, en un control, ejecuta su comando en el cajón del terminal. El botón de información de cada tarjeta dice qué busca, por qué importa y qué hacer cuando falla. Cada hallazgo muestra su archivo y su línea.

Los escáneres son:

- secretos: claves y tokens en los archivos con seguimiento. Pon `shipyard:allow-secret` en la línea de un dato de prueba, o en la línea anterior, para omitirlo.
- dependencias: vulnerabilidades conocidas (CVE) en los archivos de bloqueo, con `osv-scanner`. Anota un hallazgo revisado en `.osv-scanner.toml`.
- código: problemas OWASP como la inyección, el XSS y la ejecución remota de código, con `semgrep`. Pon `// nosemgrep` en la línea de un falso positivo revisado.
- skills: instrucciones inseguras en las skills de agente, con `skillspector`.

La lista de componentes de software (SBOM, «software bill of materials») nombra cada biblioteca que el proyecto usa, con su versión. Expórtala cuando un cliente o un equipo de seguridad pregunte qué software contiene el proyecto.

La frescura de la documentación lista los documentos que no siguieron al código de la rama, con el número. El mismo aviso se muestra en el control del commit, el control del push y la cadena de documentación de Impactos. Cada documento desactualizado tiene «Actualizar con un agente». Una ejecución de agente empieza solo después de tu clic, y la pull request que abre espera tu revisión. «Dar por visto» deja un aviso como está, con un motivo.

## Impactos

Impactos dice qué elementos toca un cambio, y propone un plan de acción. Se abre como página desde los Controles de una funcionalidad: haz clic en Impactos en el resto del código. Muestra los archivos cambiados, el código que depende de ellos y las docs que quedan obsoletas. Corregir los documentos obsoletos con un agente inicia una ejecución solo después de tu clic. La página `/flow/impacts` sigue. Necesita acceso al código.

Informe de impacto completo abre el informe como página: el tamaño del cambio por Código, Especificaciones, Documentos, Pruebas y Personas, el plan de acción y el resumen. Escribir el informe de nuevo hace otro. Informes anteriores lista los más antiguos. Copiar el resumen copia el resumen para un agente.

## Pull requests

Pull requests es una página de Code, con un enlace de vuelta a Code / Ahora. Tiene una búsqueda, el filtro Todo o Para que yo revise y Nuevo pull request. Las abiertas van primero. Las fusionadas y las cerradas están detrás de un solo botón. Elige una pull request para ver su revisión: los controles, los cambios pedidos y los revisores. Abrir la pull request abre la página de su funcionalidad.

Nuevo pull request también es una página. Escribe el título y la descripción (Escríbelo por mí pide a un agente). Elige Hacia, la rama que recibe el cambio. Ajusta Borrador y Etiquetas. Antes de enviar, una nota nombra los archivos sin confirmar, una rama base adelantada y las docs que quedan obsoletas: cada una tiene su elección. Haz clic en Abrir la pull request.

## Code host y tickets

- En la sección Comprobaciones de una pull request, Volver a ejecutar pide a la plataforma de código que repita las comprobaciones fallidas, y solo esas. Necesita el mismo derecho que otra escritura en la plataforma de código.
- En Nueva pull request, Revisores lista los usuarios de la plataforma de código, y al abrir se pide a la plataforma de código que los añada. Fusionar con fija el método por defecto del botón Fusionar de las pull requests siguientes: nunca fusiona por sí solo. Tras abrir, la página conserva Cerrar la pull request, y Marcar como lista para un borrador.
- Cada fila de pull request muestra el avatar de su autor.
- En el informe de impacto, cada línea del plan de acción tiene una casilla y un responsable. Ambos van al archivo del informe como una casilla Markdown y un nombre. Una línea no crea ningún ticket. Añadir una línea termina la lista.
- Un ticket tiene una fila Receta (la etiqueta `wf:<id>` que elige la receta) y una fila Versión. Una versión es la versión del gestor de tickets: la versión de corrección de Jira, el hito de GitHub y GitLab, la iteración de Azure DevOps y el proyecto de Linear. Un ticket tiene una sola versión.
