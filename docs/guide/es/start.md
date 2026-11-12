# Primeros pasos

Shipyard ayuda a un equipo a entregar un proyecto de software: el diseño, las especificaciones, el trabajo, los agentes, el código y el conocimiento. Todo queda en los archivos del proyecto, así que el equipo lo comparte con git.

## La ventana

- La barra izquierda contiene los espacios: Inicio, Diseño, Especificaciones, Trabajo, Fábrica, Código, Conocimiento y Ajustes.
- Las pestañas de un espacio están arriba en la página. Cada pestaña tiene un icono y su nombre.
- El inspector de la derecha muestra el elemento que seleccionas.
- La barra de estado de abajo muestra el proyecto, el estado de la sincronización y el control de commit, con el número de archivos modificados junto a Commit.
- La barra superior contiene Atrás y Adelante, Sincronizar, Actividad, la búsqueda, los botones Archivos y Terminal, Preguntar, las notificaciones y el menú de la cuenta.
  - Sincronizar muestra cuántos commits llevas de adelanto y de retraso.
  - Actividad muestra el recuento Requiere tu atención y una marca mientras una ejecución o una sesión está activa. Su panel tiene tres partes: Requiere tu atención (un enlace a Inicio / Hoy), Ejecuciones (Detener y un enlace a Fábrica / Ejecuciones) y Sesiones (Detener y un enlace a Fábrica / Sesiones).
  - Preguntar es un botón dividido. Haz clic en la parte principal para abrir o cerrar el asistente. La flecha abre los elementos de Preguntar.
  - El menú de la cuenta (tu foto) contiene Ajustes / Yo, Tema (Claro, Oscuro, Sistema), Manual, Atajos, Novedades y Repetir el recorrido.
- El asistente se abre en el lateral. Hazle una pregunta sobre el proyecto. Cada conversación es una pestaña, y un punto marca una pestaña con una respuesta nueva.
  - Bajo el cuadro de mensaje, una barra tiene el botón de adjuntar, un botón con el modelo y el esfuerzo (abre los modelos de la herramienta de IA, los niveles de esfuerzo y los modelos de las otras herramientas de IA), el permiso, el anillo de contexto y Enviar.
  - En el modo Agente el permiso es Editar con aprobación, Auto: aceptar ediciones u Omitir permisos. Omitir permisos salta cada aprobación de Claude Code o Codex: Shipyard te lo pregunta la primera vez en cada proyecto, lo muestra en rojo mientras está activo, y lo rechaza en un proyecto de solo lectura y mientras el interruptor de agentes está apagado.
  - Escribe `/` al inicio de un mensaje para listar los comandos de la herramienta de IA seleccionada. El texto llega a la herramienta de IA tal como lo escribiste.
  - Cada conversación mantiene una sesión de agente, así que un mensaje posterior continúa el trabajo anterior.
- En Ajustes, luego Yo, elige el lado de la barra y de los cajones, el color de acento, el formato de fecha, una barra superior estrecha y tu foto.

La ventana se abre con el tamaño que tenía al cerrarla. Para guardar los datos de la app junto a la app (en una memoria USB, por ejemplo), pon un archivo vacío llamado `portable` junto a la app.

## El elemento de la barra de menús

- El icono de Shipyard está en la barra de menús (la bandeja del sistema en Windows y Linux). Un punto en el icono significa que algo te espera.
- Un clic abre un panel pequeño: el gasto de hoy y del mes, las ejecuciones activas con Detener, el recuento Requiere tu atención con sus primeros elementos, el interruptor de agentes, el estado de la sincronización, el proyecto y Abrir Shipyard.
- El panel pide el mismo clic que la app para cada acción que escribe.
- En Ajustes, luego Yo, desactiva el elemento de la barra de menús.

## El recorrido

- El recorrido no se abre en el primer inicio. Se abre una vez, cuando abres tu primer proyecto. Tiene seis pasos: el ciclo, abrir un proyecto, conectar el gestor de tickets y la plataforma de código, elegir la herramienta de IA, los permisos y la primera ejecución en un ticket.
- Haz clic en Siguiente y Atrás, o pulsa las flechas izquierda y derecha. Cerrar termina el recorrido en cualquier paso. No se vuelve a abrir solo.
- Para verlo otra vez, elige Repetir el recorrido en el menú de la cuenta o en el menú Ayuda, o escribe Repetir el recorrido en la paleta, o ve a Ajustes, luego Yo, luego Permisos.
- El último paso abre este manual.

## Permisos

Shipyard pide un permiso del sistema solo después de que hagas clic en Permitir. El recorrido y Ajustes / Yo muestran cada uno con su estado: Activado, Desactivado, Sin solicitar, No necesario o Desconocido.

| Permiso | macOS | Windows | Linux |
|---|---|---|---|
| Notificaciones | Permitir muestra el aviso del sistema. Desactivado abre Ajustes del Sistema. | Enviar una prueba y Abrir Ajustes del Sistema. | Enviar una prueba. |
| Documentos, Escritorio y Descargas | Permitir deja que macOS pregunte por cada carpeta. Desactivado abre Privacidad y seguridad / Archivos y carpetas. | No necesario. | No necesario. |

Shipyard no pide acceso total al disco, la cámara, el micrófono ni la ubicación. Un proyecto en un volumen extraíble o de red recibe el aviso de macOS al abrirse.

## Primer inicio

La página del primer inicio pregunta tu rol. Elígelo y haz clic en Continuar. Después abre una carpeta, clona un repositorio o empieza un proyecto nuevo. Sin proyecto abierto, cada espacio muestra esta misma elección: Abrir una carpeta, Clonar un repositorio y Proyecto nuevo.

En Inicio, luego Hoy, una sola lista Empezar da los pasos siguientes en orden: proyecto, herramienta de IA, modelos, gestor de tickets, plataforma de código, equipo, permisos, primera decisión, primera especificación, primer ticket asignado y primera ejecución. Cada elemento tiene una acción que nombra el paso siguiente real, como Instalar, Iniciar sesión, Elegir o Conectar. Ajustes / Yo muestra la misma tarjeta. En Hoy se oculta cuando no queda nada por hacer.

## Abrir un proyecto

1. Ve a Inicio, luego Proyectos.
2. Haz clic en Abrir una carpeta local y elige la carpeta de tu proyecto. O crea un proyecto nuevo.
3. Cuando la carpeta aún no es un proyecto, haz clic en Convertir en proyecto.

## Orientarse

- Pulsa Ctrl+K (Cmd+K en un Mac) para abrir la paleta. Escribe el nombre de una página, de un elemento o de una acción.
- En la paleta, escribe unas palabras para buscar en el texto de tus documentos, decisiones, especificaciones, preguntas, tickets y diseños. Las mayúsculas y los acentos no importan («decision» encuentra «décision»), cada palabra debe coincidir, y la última palabra puede ser un comienzo. Los resultados se agrupan por tipo, muestran un extracto corto con las palabras marcadas y ponen primero una página que citan muchos elementos. Elige Preguntar al asistente para poner esos elementos como contexto en el cuadro de mensaje del asistente. No se envía nada hasta que lo envíes. El documento que abres desde un resultado marca las palabras.
- Las listas de Diseño y Conocimiento tienen un cuadro Buscar que filtra la lista con la misma búsqueda.
- Pulsa Ctrl+1 a Ctrl+8 para ir a un espacio.
- Abre la paleta y elige Abrir el manual de esta página para leer la ayuda de la página que ves.
- Pulsa Ctrl+[ y Ctrl+] (Cmd en un Mac), o haz clic en Atrás y Adelante en la barra superior, para moverte entre las vistas que abriste.
- Pulsa F1, o elige Manual en el menú de la cuenta, para leer la ayuda de la página que ves.
- Haz clic en el botón de la barra lateral, en el extremo izquierdo de la barra superior, para ocultar o mostrar la barra lateral.
- Por debajo de 1100 px, los botones Archivos y Terminal están en el menú Más.
- Haz clic en el botón Terminal para abrir o cerrar el cajón del terminal. Terminal y Manual no son pestañas. La paleta y el menú de la ventana mantienen sus entradas.
- Haz clic en Sincronizar para sincronizar. Haz clic en la flecha junto a él para Solo traer o para Push.
- Cuando un error tiene un botón que abre un ajuste, haz clic en él. La página se abre en la fila exacta, mueve el foco a su control y lo marca durante 2 segundos.
- Mantén Ctrl (Cmd en un Mac) y gira la rueda del ratón sobre un diagrama o una imagen para hacer zoom. Arrastra para moverlo. Usa Pantalla completa para una vista grande.
- Pulsa Ctrl+= y Ctrl+- para cambiar el tamaño del texto, y Ctrl+0 para volver a 16 px. Ajustes / Yo ofrece la misma opción.
- Pulsa Ctrl+Shift+K para ver todos los atajos de teclado.

## Tu rol

En Ajustes, luego Yo, elige tu rol. El rol fija el espacio que se abre primero. Un responsable técnico empieza en Fábrica, Ejecuciones. Un jefe de proyecto empieza en Trabajo, Tablero.

## Seguro por defecto

- La app nunca envía un cambio a un gestor de tickets o a una plataforma de código sin tu clic.
- Un token va al llavero de tu ordenador. La app nunca lo vuelve a mostrar.
- Un proyecto con un perfil de solo lectura no acepta ningún cambio.

## Palabras

| Palabra | Significado |
|---|---|
| Ref | El nombre corto de un elemento, como `adr:0003` o `wi:ACME-12`. Haz clic en una ref para abrir su elemento. |
| Gestor de tickets | La herramienta que contiene los tickets: Jira, GitHub, GitLab, Azure DevOps o Linear. |
| Plataforma de código | El servidor que contiene el código: GitHub o GitLab. |
| Ejecución | Un trabajo de un agente en un ticket. |
| Especificación | Un texto que dice lo que el producto debe hacer. |
| ADR | Un registro de decisión: una decisión, sus opciones y sus razones. |
| Servidor MCP | Una herramienta que un agente puede llamar, como Jira o Figma. |

Pasa el ratón sobre una palabra marcada en la lista, en el recorrido o en una página vacía, o pon el foco del teclado en ella. Una frase la explica, con un enlace al manual. Las palabras marcadas son gestor de tickets, plataforma de código, herramienta de IA, modelo, especificación, decisión, ejecución y pull request.
