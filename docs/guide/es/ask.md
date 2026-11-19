# La barra Preguntar

Preguntar o indicar a Shipyard, en la barra superior, es la única barra para una pregunta, un lugar y una acción. Pulsa Ctrl+K (Cmd+K en un Mac) para ir a ella. Escribe, y usa las flechas e Intro. Escape la cierra.

## Ir a

Ir a abre un lugar, una sección, un proyecto, un elemento o un resultado de búsqueda.

Escribe unas palabras para buscar en el texto de tus documentos, decisiones, especificaciones, preguntas, tickets y diseños. Las mayúsculas y los acentos no importan («decision» encuentra «décision»), cada palabra debe coincidir, y la última palabra puede ser un inicio. Los resultados se agrupan por tipo, muestran un extracto corto con las palabras marcadas, y ponen primero una página que citan muchos elementos. El documento que abres desde un resultado marca las palabras.

Elige Preguntar al asistente para poner esos elementos como contexto en el cuadro de mensaje del asistente. No se envía nada hasta que lo envías.

## Hacer

Hacer inicia una acción o una petición para la página que ves. Ejemplos: Funcionalidad nueva, Abrir el manual de esta página, Repetir el recorrido. Una acción que tu rol no puede usar no se muestra.

## Preguntar

Pregunta qué bloquea, qué se detuvo o qué te espera. La respuesta nombra cada funcionalidad y da su acción: Responder, Desbloquear, Añadir presupuesto, Reintentar, Reanudar o Cerrar como terminada.

Cualquier otro texto va al asistente cuando pulsas Intro.

## El asistente

El asistente se abre en el lateral. Hazle una pregunta sobre el proyecto. Cada conversación es una pestaña, y un punto marca una pestaña con una respuesta nueva.

- Bajo el cuadro de mensaje, una barra tiene el botón de adjuntar, un botón con el modelo y el esfuerzo (abre los modelos de la herramienta de IA, los niveles de esfuerzo y los modelos de las otras herramientas de IA), el permiso, el anillo de contexto y Enviar.
- En el modo Agente el permiso es Editar con aprobación, Auto (acepta las ediciones) u Omitir permisos. Omitir permisos salta cada aprobación de Claude Code o Codex: Shipyard te lo pregunta la primera vez en cada proyecto, lo muestra en rojo mientras está activo, y lo rechaza en un proyecto de solo lectura y mientras el interruptor de agentes está desactivado.
- Escribe `/` al inicio de un mensaje para listar los comandos de la herramienta de IA seleccionada. El texto llega a la herramienta de IA tal como lo escribiste.
- Cada conversación mantiene una sesión de agente, así que un mensaje posterior continúa el trabajo anterior.
- Deshacer descarta los cambios que el asistente hizo en los archivos. Sin Deshacer, los cambios se quedan.
- Selecciona un texto en una página para enviarlo al asistente, o a Flujo como nuevo elemento de trabajo.
