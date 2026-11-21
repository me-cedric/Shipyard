# Código

Código trabaja en el repositorio git del proyecto. No necesitas conocer los comandos de git: cada acción tiene un botón. El selector tiene cuatro secciones: Ahora, Historial, Ramas y Terminal.

## Ahora

Ahora es un resumen corto: los archivos para el commit y las pull requests abiertas, una fila hacia la salud del producto y las acciones Rama de trabajo, Terminal, Archivos y Abrir pull request.

La tarjeta de los archivos para el commit muestra los tres primeros archivos con las líneas añadidas y quitadas, un enlace a los demás archivos, un mensaje de commit, Escríbelo por mí y Commit. El enlace abre la página de los cambios locales.

1. Marca los archivos que quieres conservar en una lista plana. Elegir todo y No elegir nada marcan toda la lista. O descarta un cambio.
2. Escribe el mensaje de commit, añade una descripción si quieres, y haz clic en Commit. Un commit toma solo los archivos marcados. El botón Commit de la tarjeta de la marca de sincronización hace lo mismo desde cualquier página.

- Escríbelo por mí pide al asistente un mensaje a partir de los archivos preparados. No se envía nada hasta que lo envías.
- Un grupo sin archivos muestra una línea discreta, como «Nada preparado».
- Un archivo renombrado se muestra con su ruta nueva, con la antigua: `antiguo → nuevo`. Prepararlo o descartar su cambio actúa sobre las dos rutas.
- Cuando dos cambios coinciden en las mismas líneas, una vista de conflicto muestra los dos lados. Elige uno, escribe el resultado, o pásalo a un agente.

Las pull requests de la plataforma de código vienen después. La lista tiene una búsqueda y dos filtros. Todas muestra cada pull request. Por revisar muestra las pull requests abiertas que no son borradores, esperan una revisión y no tienen cambios solicitados. Las pull requests abiertas se muestran primero. El botón Fusionadas y cerradas muestra los otros dos grupos, cada uno con su número. Una fila muestra el número, el título, la marca de borrador, el estado de los controles y el estado de la revisión. Abrir pull request empieza una nueva: Escribir con un agente rellena el título y el cuerpo a partir de los cambios de la rama, el ticket enlazado y el cambio de especificación enlazado, y nada se abre hasta que haces clic en Abrir.

Haz clic en una fila para abrir la pull request en la página de su funcionalidad, sección Cambios (consulta la página Flujo, La página de una funcionalidad). Una pull request lista para fusionar muestra Fusionar: abre esa página, donde confirmas la fusión.

Dos puertas abajo abren Salud del producto (Flujo / Salud) y los archivos del proyecto.

## Historial

Historial lista los commits, el más reciente primero. Selecciona un commit para ver sus archivos y sus cambios. Cada autor muestra una foto de perfil: de GitHub para una dirección no-reply de GitHub, si no de Gravatar, o las iniciales cuando no hay ninguna. Shipyard envía a Gravatar solo un hash de la dirección.

## Ramas

Ramas lista las ramas de este ordenador y del servidor. Crea, cambia a, fusiona o elimina una rama. La aplicación nunca elimina la rama en la que trabajas.

El selector de rama, en la tarjeta de la marca de sincronización y en Código / Ahora, tiene un campo de filtro. Escribe para reducir la lista, muévete con las flechas y pulsa Intro. Una rama remota se extrae como una rama local nueva que la sigue. La fila Rama nueva crea una rama a partir de la rama en la que trabajas.

## Terminal

Terminal es una línea de comandos en la carpeta del proyecto. El botón Terminal de Código / Ahora y la acción Terminal de la barra Preguntar o indicar a Shipyard abren la misma línea de comandos en el cajón del terminal, desde cualquier página. Cuando el shell termina, haz clic en Reiniciar. Un enlace en la salida se abre en tu navegador.

## Sincronizar

Una marca en el extremo derecho de la fila superior de cada página muestra el estado del repositorio: La sincronización falló, el número de archivos modificados, Aún no compartido, por detrás, por delante o Sincronizado. Haz clic en ella para abrir una tarjeta con los archivos modificados, la rama de trabajo y los botones Sincronizar, Solo traer, Push y Commit. Un enlace de la tarjeta abre Código / Ahora.

Sincronizar trae los cambios del equipo y pone tu rama al día. La flecha unida a él abre Solo traer y Push. Enviar tus commits al servidor es una acción aparte. La aplicación nunca fuerza un push.
