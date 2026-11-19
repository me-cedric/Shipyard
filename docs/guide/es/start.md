# Primeros pasos

Shipyard ayuda a un equipo a entregar un proyecto de software: las funcionalidades, el plan, las personas y los agentes, las especificaciones, el diseño y el código. Todo queda en los archivos del proyecto, así que el equipo lo comparte con git.

## La ventana

- La barra izquierda contiene los siete lugares: Hoy, Flujo, Plan, Equipo, Biblioteca, Código y Configuración. Este manual tiene una página para cada lugar.
- Las secciones de un lugar están arriba en la página, en un solo selector. Biblioteca no tiene selector: se abre con cuatro puertas, y cada una de sus páginas tiene un enlace Biblioteca que vuelve a ellas.
- El inspector de la derecha muestra el elemento que seleccionas.
- La barra lateral contiene también el nombre del proyecto arriba y tu cuenta abajo.
  - El nombre del proyecto abre un menú con tus proyectos y la página Proyectos.
  - Tu cuenta abre el menú de la cuenta: el tema, el idioma, el manual, la versión de Shipyard y Salud.
- La fila superior de cada página contiene el botón de la barra lateral, Atrás y Adelante, la barra Preguntar o indicar a Shipyard y la marca de sincronización. La ventana no tiene barra superior ni barra de estado.
  - La marca de sincronización muestra el estado del repositorio. Haz clic en ella para ver los archivos modificados, la rama, la sincronización y el commit. Consulta la página Código, Sincronizar.
  - Preguntar o indicar a Shipyard es la única barra para una pregunta, un lugar y una acción. Consulta la página La barra Preguntar.
  - El menú de la cuenta (tu foto) contiene Configuración / Yo, Tema (Claro, Oscuro, Sistema), Manual, Atajos, Novedades y Repetir el recorrido.
- Por debajo de 1100 px, los botones Archivos y Terminal están en el menú Más.

La ventana se abre con el tamaño con el que la cerraste. Para guardar los datos de la aplicación junto a la aplicación (en una memoria USB, por ejemplo), pon un archivo vacío llamado `portable` junto a la aplicación.

## El elemento de la barra de menús

- El icono de Shipyard está en la barra de menús (la bandeja del sistema en Windows y Linux).
- Un clic abre un panel pequeño: el gasto de hoy y del mes, las ejecuciones activas con Detener, lo que te espera (la misma lista que en Hoy), el recordatorio de registrar el tiempo, el interruptor de agentes, el estado de la sincronización, el proyecto y Abrir Shipyard.
- El panel pide el mismo clic que la aplicación para cada acción que escribe.
- En Configuración, luego Yo, desactiva el elemento de la barra de menús.

## Primer inicio

La página del primer inicio pregunta tu rol. Elígelo y haz clic en Continuar. Después abre una carpeta, clona un repositorio o empieza un proyecto nuevo. Sin proyecto abierto, cada lugar muestra esta misma elección. Consulta la página Proyectos.

En Hoy, una lista Empezar da los pasos siguientes en orden: proyecto, herramienta de IA, modelos, gestor de tickets, plataforma de código, equipo, permisos, primera decisión, primera especificación, primer ticket asignado y primera ejecución. Cada elemento tiene una acción que nombra el paso siguiente real, como Instalar, Iniciar sesión, Elegir o Conectar. Configuración / Inicio muestra los mismos pasos, una pregunta cada vez. En Hoy la lista se oculta cuando no queda nada por hacer.

## El recorrido

- El recorrido no se abre en el primer inicio. Se abre una vez, cuando abres tu primer proyecto. Tiene seis pasos: el ciclo, abrir un proyecto, conectar el gestor de tickets y la plataforma de código, elegir la herramienta de IA, los permisos y la primera ejecución en un ticket.
- Haz clic en Siguiente y Atrás, o pulsa las flechas Izquierda y Derecha. Cerrar termina el recorrido en cualquier paso. No se abre de nuevo por sí solo.
- Para verlo otra vez, elige Repetir el recorrido en el menú de la cuenta o en el menú Ayuda, o escribe Repetir el recorrido en la barra Preguntar, o ve a Configuración, luego Este ordenador, luego Permisos.
- El último paso abre este manual.

## Permisos

Shipyard pide un permiso del sistema solo después de que hagas clic en Permitir. El recorrido y Configuración / Este ordenador muestran cada uno con su estado: Activado, Desactivado, Sin solicitar, No necesario o Desconocido.

| Permiso | macOS | Windows | Linux |
|---|---|---|---|
| Notificaciones | Permitir muestra la petición del sistema. Desactivado abre Ajustes del Sistema. | Enviar una prueba, y Abrir Ajustes del Sistema. | Enviar una prueba. |
| Documentos, Escritorio y Descargas | Permitir deja que macOS pregunte por cada carpeta. Desactivado abre Privacidad y seguridad / Archivos y carpetas. | No necesario. | No necesario. |

Shipyard no pide Acceso total al disco, la cámara, el micrófono ni la ubicación. Un proyecto en un volumen extraíble o de red recibe la petición de macOS cuando se abre.

## Tu rol

En Configuración, luego Yo, elige tu rol. El rol fija la página que se abre primero y los paneles de Hoy. Consulta la página Equipo, Derechos.

| Rol | Primera página |
|---|---|
| Product owner | Flujo / Lista |
| Jefe de proyecto | Plan / Cronograma |
| Arquitecto | Biblioteca / Decisiones |
| Responsable técnico | Flujo |
| Analista de negocio | Biblioteca / Especificaciones |
| Desarrollador | Flujo |
| Tester | Biblioteca / Planes de pruebas |
| Diseñador | Biblioteca / Pantallas |
| Lector | Hoy |

Cuando tu rol no ve su primera página, se abre Hoy. Sin rol, se abre Hoy.

## Orientarse

- Pulsa Ctrl+K (Cmd+K en un Mac) para ir a la barra Preguntar. Escribe el nombre de una página, un elemento o una acción, y usa las flechas e Intro.
- Pulsa de Ctrl+1 a Ctrl+7 para ir a un lugar.
- Pulsa F1, o elige Manual en el menú de la cuenta, o elige Abrir el manual de esta página en la barra Preguntar, para leer la ayuda de la página que ves. El manual se abre en la página del lugar, en la sección donde estabas.
- Pulsa Ctrl+[ y Ctrl+] (Cmd en un Mac), o haz clic en Atrás y Adelante en la fila superior, para moverte entre las páginas que abriste.
- Haz clic en el botón de la barra lateral, en el extremo izquierdo de la fila superior, para ocultar o mostrar la barra lateral.
- Elige Terminal o Archivos en la barra Preguntar o indicar a Shipyard para abrir o cerrar el cajón del terminal o el cajón de los archivos.
- Una dirección de una versión anterior funciona todavía: abre la página que contiene la misma función ahora.
- Cuando un error tiene un botón que abre un ajuste, haz clic en él. La página se abre en la fila exacta, mueve el foco a su control y lo marca durante 2 segundos.
- Mantén Ctrl (Cmd en un Mac) y gira la rueda del ratón sobre un diagrama o una imagen para hacer zoom. Arrastra para moverlo. Usa Pantalla completa para una vista grande.
- Pulsa Ctrl+= y Ctrl+- para cambiar el tamaño del texto, y Ctrl+0 para volver a 16 px. Configuración / Yo tiene la misma opción.
- Pulsa Ctrl+Shift+K para ver todos los atajos de teclado.
- Cada botón, campo e interruptor mide 44 px de alto o más. Las páginas funcionan en una ventana de 960 por 600 px sin desplazamiento lateral.

## Seguro por defecto

- La aplicación nunca envía un cambio a un gestor de tickets o a una plataforma de código sin tu clic.
- Un token va al llavero de tu ordenador. La aplicación no lo muestra nunca más.
- Un proyecto con un perfil de solo lectura no acepta ningún cambio.

## Palabras

| Palabra | Significado |
|---|---|
| Lugar | Una entrada de la barra izquierda, como Flujo o Biblioteca. |
| Funcionalidad | Una cosa que construir. Flujo la muestra una vez, con su ticket, su especificación, el trabajo del agente y su pull request. |
| Receta | Los pasos que un agente sigue en una funcionalidad: plan, trabajo, revisión y luego una pull request. |
| Equipo | Las personas y los agentes del proyecto. |
| Ref | El nombre corto de un elemento, como `adr:0003` o `wi:ACME-12`. Haz clic en una ref para abrir su elemento. |
| Gestor de tickets | La herramienta que guarda los tickets: Jira, GitHub, GitLab, Azure DevOps o Linear. |
| Plataforma de código | El servidor que guarda el código: GitHub o GitLab. |
| Ejecución | Un trabajo de un agente en un ticket. |
| Especificación | Un texto que dice qué debe hacer el producto. |
| ADR | Un registro de decisión: una decisión, sus opciones y sus motivos. |
| Servidor MCP | Una herramienta que un agente puede llamar, como Jira o Figma. |

Pasa el puntero sobre una palabra marcada en la lista Empezar, en el recorrido o en una página vacía, o lleva el foco del teclado a ella. Una frase la explica, con un enlace al manual. Las palabras marcadas son gestor de tickets, plataforma de código, herramienta de IA, modelo, especificación, decisión, ejecución y pull request.
