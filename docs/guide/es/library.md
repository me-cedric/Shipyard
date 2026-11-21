# Biblioteca

Biblioteca contiene las páginas que describen el proyecto: qué debe hacer, cómo está construido, por qué es así, y lo que el equipo aprende y comparte. Cada elemento es un archivo del proyecto.

Biblioteca se abre con cuatro puertas. Cada puerta nombra lo que buscas, y contiene una ficha por página. Haz clic en una ficha para abrir su página. Cuando algo te espera, una ficha naranja va primero y da el número: las preguntas abiertas, o las decisiones en espera. Una ficha marca una página cuyo origen cambió después. Una página que tu rol no puede ver no tiene ficha.

Biblioteca no tiene selector de secciones. En cada página de Biblioteca, haz clic en Biblioteca arriba para volver a las puertas.

Las fichas Qué está probado, Respuestas y Glosario abren la página que las contiene. La ficha Aprender muestra cuántos pasos de la ruta has terminado. Bajo las puertas, las tarjetas Fijado y Abierto por último listan páginas: Fijar guarda una página en Fijado, y Quitar la retira. Abierto por último guarda también los elementos con una ref (una spec, una decisión, un diagrama, un documento): cada fila muestra una etiqueta de su tipo, su nombre y Fijar.

## Leer y cambiar un elemento

1. Abre una página y selecciona un elemento. O haz clic en la acción principal de la página para crear uno. Selecciona un elemento para ver, en el inspector, los elementos que lo citan.
2. Un elemento con una imagen se abre solo con la imagen. Un selector arriba tiene tres opciones: Imagen, Ambos (el texto y la imagen lado a lado) y Texto. Un documento tiene Lectura, Ambos y Texto. Shipyard conserva tu elección. Muestra el texto por sí solo para un archivo nuevo, cuando alguien cambió el archivo al mismo tiempo, y para un error que nombra una línea.
3. Cambia el texto o el dibujo, y haz clic en Guardar. La aplicación escribe el archivo entero o nada.

- Buscar: las listas tienen un campo Buscar. Usa la misma búsqueda que la barra Preguntar.
- Más: el menú al final de la fila de encabezado de una página contiene los controles que la página no muestra: Copiar la referencia, Copiar el nombre del archivo, Renombrar, Eliminar y algunos filtros.
- Eliminar: elige Eliminar en el menú Más de la página, o abre el menú de un elemento (clic derecho) y elige Eliminar. La aplicación nombra el archivo y pregunta una vez. El archivo va después a la papelera.
- Renombrar: el menú Más y el menú del elemento tienen Renombrar. Escribe el nombre nuevo; la extensión se queda. La revisión lista cada archivo y cada línea cuyos enlaces cambian. Renombrar mueve después el archivo y reescribe esos enlaces en un paso. Si una escritura falla, cada archivo queda como estaba.
- Preguntar al asistente: el último grupo del menú del elemento. Elige una petición para este tipo de elemento y tu rol. Rellena el cuadro de mensaje con el elemento, su archivo, su especificación, su ticket y los elementos que lo citan. No se envía nada hasta que lo envías.
- Cuando alguien cambia el archivo al mismo tiempo, la aplicación te lo dice. Elige Recargar para tomar su versión, o Conservar el mío.
- Un proyecto de solo lectura rechaza el guardado, la eliminación y el cambio de nombre.

## Qué debe hacer

### Especificaciones

Especificaciones lista lo que el producto hace hoy. Elige una especificación a la izquierda para leerla a la derecha, con cada requisito y su estado. Al lado están las tarjetas Cambios en curso (con Archivar para un cambio terminado), Vinculados y Comprobar las especificaciones (sintaxis y enlaces). El selector Lectura, Texto, Archivos tiene Editar. Los botones Comparar con el código y Escribir una especificación desde el código envían una petición preparada al asistente. Un cambio de una especificación empieza como propuesta: mira la página Flujo, Lista y La página de una función, Resumen.

### Planes de pruebas

Planes de pruebas se abre con un plan: una tarjeta por escenario, con sus pasos, una ficha de resultado y Editar. Al lado están las tarjetas Requisitos y Otros planes de pruebas. Escribir los escenarios por mí y Ejecutar envían una petición preparada al asistente. Un plan sin escenario se abre en su texto. Un hallazgo de la comprobación abre el plan en su texto, en su línea.

Qué está probado se abre desde su ficha en la puerta Qué debe hacer, en la dirección `/library/test-plans/coverage`, con el enlace Planes de pruebas para volver. Muestra fichas de filtro, una tarjeta por estado (por ejemplo Correctos) con su número y sus filas, la comprobación de los escenarios, Escribir las pruebas que faltan y Ejecutar las pruebas.

### Preguntas

Preguntas es el registro de los puntos abiertos: riesgos, supuestos, problemas, dependencias y preguntas. El título da el número de elementos abiertos. Cada elemento abierto es una tarjeta con un campo de respuesta y el botón Responder; una respuesta vacía no escribe nada.

- Una fila de fichas filtra por tipo, y Mías muestra las tuyas. Los filtros por texto, estado y responsable están en el menú Más. Exportar está en el encabezado.
- Haz clic en Nueva pregunta para añadir una. Elige el responsable en el equipo.
- Los elementos respondidos están en una tarjeta Cerradas. Después de responder una pregunta de una especificación, Añadir la respuesta a la especificación copia la respuesta en la especificación.

## Cómo está construido

### Mapa

Mapa dibuja los elementos del proyecto en grupos, con los enlaces entre ellos. Filtra por tipo. El menú Más contiene las vistas Mapa, Tabla y Grafo, y los filtros Huérfanos y Obsoletos.

- Un elemento que nada cita se muestra como huérfano.
- Un elemento cuyo origen cambió después se muestra como desactualizado.
- Selecciona un elemento para abrirlo en el inspector.

Con el origen Código, el mapa muestra las carpetas del código. Una línea entre dos carpetas es más gruesa cuando hay más llamadas entre sus archivos. Selecciona una carpeta para ver sus archivos, y luego un archivo para ver sus símbolos y qué los llama o qué llaman. Mostrar todo vuelve al mapa. Índice inicia el servidor de índice del código cuando está apagado, construye el índice y detiene el servidor. Si el programa termina con un error, la página nombra el programa, su código de salida y sus últimas líneas: corrige la causa y haz clic de nuevo en Índice. La tarjeta del símbolo tiene Explicar y Abrir en el editor, y Especificaciones y decisiones que lo usan abre el inspector. Huérfanos muestra los archivos que ninguna llamada alcanza ni deja. El selector Conocimiento y Código está arriba, y Código tiene la dirección `/library/graph?source=code`.

Un archivo cuya spec cambió después de su último cambio muestra la etiqueta Obsoleto.

### Arquitectura

Arquitectura muestra los modelos de arquitectura del proyecto como vistas. Las vistas se dibujan a partir del texto del modelo. Unas fichas bajo el título eligen el modelo, y Nuevo modelo añade uno. El selector Imagen, Ambos, Texto, con Editar, está en el encabezado; en Ambos la imagen está a la izquierda y el texto a la derecha.

Un diagrama o una imagen, en Arquitectura y en Pantallas, se ajusta a su marco y queda en el centro al abrirse. Para moverlo:

- Desplazar: arrástralo, o usa un gesto lateral en el panel táctil. Una rueda vertical desplaza la página.
- Zoom: pellizca, o mantén Ctrl o Cmd y gira la rueda.
- Teclado: haz clic en el marco para darle el foco, y pulsa las flechas para desplazar, + o - para el zoom y 0 para ajustar.
- Ajustar devuelve todo el diagrama al marco.

### Diagramas

Diagramas contiene los dibujos del proyecto: Excalidraw, Mermaid, draw.io y BPMN. Una cuadrícula o una lista muestra cada diagrama con su formato. Haz clic en un diagrama y luego en Abrir o Editar; Cambiar el formato y Usado por están en su tarjeta. El botón Dibujarlo por mí envía una petición preparada al asistente, y un botón Nuevo por formato añade un diagrama. Dibuja en el editor y guarda.

### Pantallas

Pantallas muestra las pantallas del producto y los tokens de diseño de tu proyecto. Vienen del documento de diseño (CSS en un bloque de código), de un archivo `tokens.css`, de un archivo `*.tokens.json` o de un bloque `@theme` de Tailwind 4, agrupados por archivo. Sin tokens la página dice Aún no hay tokens; haz clic en Añadir tokens al documento de diseño, edita el bloque y guarda. La página nunca muestra los tokens de Shipyard. Cada pantalla es una tarjeta con Construida o Sin construir. El selector Pantallas y Tokens muestra los tokens. Del diseño al código abre la pantalla abierta, o la primera, en el inspector, donde está Escribir el plan.

- Un archivo `.fig` muestra la vista previa que Figma guarda en él.
- Para leer Figma, añade una vez el token de tu cuenta de Figma. Va al llavero de tu ordenador.
- Después pega la dirección de un proyecto de Figma y haz clic en Listar los archivos. Cada archivo muestra su vista previa y sus tokens de diseño.

### API

API muestra los contratos de API. Abre un contrato para leer sus rutas. Prueba una ruta contra un servidor del contrato. La lista muestra los puntos de acceso de todos los contratos. Probar: elige un servidor, un método y una ruta y haz clic en Enviar; la respuesta aparece en la caja oscura de debajo.

La tarjeta de un endpoint enlaza al cambio que cita el contrato.

### Datos

Datos muestra los modelos de datos: las tablas y los enlaces entre ellas. Buscar una tabla filtra la lista. La imagen marca claves y enlaces, y el selector Imagen, Ambos, Texto muestra el texto `.dbml`.

### Flujos de red

Flujos de red lista los flujos de red como tabla: de dónde, a dónde, el puerto y el protocolo. Añade, cambia o quita una fila, y guarda. Cada fila tiene Desde, Hasta y Por qué. El selector Flujos y Bloques y la tarjeta Bloques y hosts muestran las otras vistas. Abrir la matriz completa abre `/library/flows/matrix`: una página con el enlace Flujos de red para volver, fichas de filtro, Buscar un host y una fila por flujo (Permitir o Denegar), con Editar y Quitar en el menú de la fila. Añadir un flujo está en el menú Más de la matriz, y Editar como texto abre el archivo.

Comprobar con el código busca en el código los hosts que llama. Una fila dice No está en el código cuando ningún código llama a su host, y una tarjeta nombra cada flujo denegado que el código usa, con Mostrarlo y Pedir el cambio.

## Por qué es así

### Decisiones

Decisiones contiene los registros de decisión (ADR). Cada registro da una decisión, las opciones y los motivos.

- Haz clic en Nueva decisión para escribir una. Un formulario pide cada parte.
- Una decisión propuesta se muestra primero, con Te espera. Escribe un Motivo y haz clic en Aceptar o Rechazar; un motivo vacío se rechaza. La tarjeta Usado por lista lo que cita la decisión.

### Reglas del proyecto

Reglas del proyecto muestra una tarjeta numerada por regla que todo cambio debe seguir. Editar cambia el texto, y Añadir una regla añade una al final. La tarjeta Quién puede cambiar las reglas enlaza con Equipo / Derechos (Cambiar los derechos), y Quién sigue las reglas lista los roles de agente.

Versiones anteriores lista los commits que cambiaron el archivo. Leer muestra una versión antigua; Restaurar escribe su texto en el archivo y no hace commit, así que aún puede deshacerse.

## Aprender y compartir

### Aprender

Aprender ayuda a una persona nueva a orientarse.

- Ruta: una tarjeta con los pasos en orden de lectura (la arquitectura, las decisiones y luego las especificaciones). Cada paso tiene un número, su tipo y un título; Empezar abre el paso siguiente. Un paso que abres cuenta como hecho. Una barra y N de M muestran tu avance.
- Glosario: las palabras que definen las especificaciones. Un término abre su especificación.
- Rutas de aprendizaje: cursos, certificaciones y lecturas, con los expertos del equipo que pueden ayudar. Elige una persona y marca los pasos que esa persona terminó. La tabla de progreso del equipo muestra cada persona y cada ruta. El avance del equipo está en la columna derecha: una fila por persona, con una barra y N de M.
- Canales: los canales de noticias del proyecto. Pega la dirección RSS o Atom de un sitio y haz clic en Suscribirse. La aplicación lee cada canal y guarda una copia durante una hora.

Expertos es una tarjeta con las personas del archivo del equipo y sus temas. Añadir una palabra escribe una palabra y su sentido en `docs/glossary.md`, y el glosario lee ese archivo junto a las specs. Un paso puede tener una segunda etiqueta: Lectura, Curso o Certificación.

### Guía del equipo

Guía del equipo muestra el árbol de páginas a la izquierda, con Buscar una página, y la página abierta. Páginas que enlazan aquí lista las páginas que la citan, y Pedir a un agente que la actualice envía una petición preparada al asistente. Pasa a Editar para cambiar una página: el selector Lectura, Ambos, Texto muestra la página como se lee, la página junto a su texto, o solo el texto. Haz clic en Página nueva para añadir una. La fila Manual, con F1, abre el manual.

Historial, en una página, lista del mismo modo los commits que la cambiaron, y la página dice quién la cambió por última vez.

### Documentos

Documentos lista los documentos del proyecto, con una ficha para el formato. Abre uno con Lectura, Ambos o Texto y haz clic en Editar para cambiarlo. Buscar en el texto, Renombrar y Eliminar están en el menú Más. La tarjeta Archivo tiene Mostrar en la carpeta y Exportar. La tarjeta El planificador puede usar este documento tiene Convertir en diapositivas y Convertir en especificación: cada uno envía una petición preparada al asistente. Exporta el dosier de arquitectura y la documentación funcional como archivos Word, y una hoja de cliente como archivo Excel. Cada exportación abre un diálogo Guardar como con el nombre rellenado y la carpeta de tu último guardado; Cancelar no exporta nada. Tras guardar, Mostrar en la carpeta y Abrir funcionan sobre el archivo nuevo.

Un archivo Word tiene una portada, un índice (Word rellena los números de página cuando pide actualizar los campos), los diagramas Mermaid del proyecto como imágenes, y números de página. Un archivo LikeC4 o draw.io se muestra como imagen cuando hay un PNG con el mismo nombre a su lado, y si no como su ruta. Una hoja Excel tiene una fila de cabecera con estilo que queda en pantalla.

Añadir un archivo copia cualquier archivo que elija en la carpeta de documentos. Un archivo Word sigue siendo un archivo Word.

### Diapositivas

Diapositivas contiene las presentaciones del proyecto. Cada presentación es un archivo HTML en `docs/slides/`, con sus animaciones y sus pasos. Las presentaciones son tarjetas a la izquierda, y la presentación abierta está a la derecha con un paginador y una tira de miniaturas.

- Nueva presentación: escribe un nombre. El asistente se abre con una petición a un agente para escribir la presentación. Lee la petición y envíala.
- Haz clic en una presentación para mostrarla. Las flechas, Espacio, Inicio y Fin recorren las diapositivas y los pasos.
- Presentar muestra la presentación a pantalla completa. Pulsa Escape para parar.
- Exportar PDF: elige el archivo en el diálogo Guardar como. Cada diapositiva pasa a ser una página. Esto funciona solo en macOS.
- Una presentación antigua escrita como texto se muestra en solo lectura. Haz clic en Convertir para pedir a un agente que la reescriba como presentación HTML.
- Para eliminar una presentación, abre su menú y haz clic en Eliminar. El archivo va a la papelera.

Una presentación escrita en Markdown tiene Editar, Exportar PDF y Notas del orador. Una nota es un bloque `Note:` después de una diapositiva. Exportar PDF funciona solo en macOS.

### Paneles

Paneles muestra un panel a la vez; el selector arriba de la página lo elige. Sus mosaicos son de solo lectura. Editar abre la página de edición del panel, Exportar el informe abre Informes, y Crear un panel para mí envía una petición preparada al asistente. Panel nuevo está en el menú Más. Más cifras enlaza con Equipo / Gasto, Flujo / Salud y Plan. Los mosaicos que fijas se muestran arriba en Paneles. Un mosaico cuya fuente está apagada lo dice.

La página de edición tiene la dirección `/library/dashboards/<nombre>/edit`, el enlace Paneles para volver, Renombrar y Listo. Añadir un mosaico muestra una ficha por tipo de mosaico. Cada mosaico tiene un asa para arrastrar, Ajustes y Quitar; Mover a la izquierda, Mover a la derecha y el tamaño están en Ajustes. Mostrar como tabla da las cifras detrás de un gráfico.

Crear un mosaico para mí pide a un agente que proponga un mosaico a partir de tus palabras. No necesitas conocer los tipos de mosaicos.

1. Abre la página de edición del panel (Editar) y haz clic en Crear un mosaico para mí, junto a Añadir mosaico.
2. Escribe lo que debe mostrar el mosaico, en palabras sencillas. Por ejemplo: las preguntas abiertas por responsable.
3. Presupuesto (USD) es el límite del agente: el agente se detiene en el presupuesto, o después de 2 minutos. Su última respuesta puede pasar un poco del presupuesto. El presupuesto empieza en 2 dólares. Menos presupuesto y Más presupuesto lo cambian en 1 dólar.
4. Haz clic en Crear. Mientras el agente trabaja, Detener lo termina. El trabajo se muestra también en Equipo / Sesiones, y su Detener hace lo mismo.
5. Mira el Mosaico propuesto. Aceptar lo añade al panel y guarda. Descartar lo abandona.

El agente solo lee el proyecto. El panel no cambia hasta que haces clic en Aceptar. Si la página dice que el presupuesto se agotó, añade presupuesto y haz clic de nuevo en Crear. Un panel que no puedes cambiar no tiene Crear un mosaico para mí.

Cada ficha tiene un gráfico: Número, Barras, Línea, Lista, Etapas del flujo, Gasto o Salud. El tipo de datos elige el primer gráfico; cámbielo en el menú de la ficha. Fijar en Hoy, en la página de edición, muestra el panel como una tarjeta en Hoy. Un selector de versiones junto a Editar deja en las fichas del gestor de incidencias solo las incidencias de la versión.

### Informes

Informes lista cada archivo que Shipyard puede crear para una persona que no usa Shipyard: un cliente, un responsable, un auditor. Cada informe es un mosaico. Formato, arriba, muestra Todos los informes, o solo los archivos Word, los archivos Excel o las imágenes. Escrito para usted contiene tres documentos, cada uno con Abrir y Escribirlo. Un enlace lleva a Paneles.

- Exportar: Shipyard abre el diálogo Guardar como. Elige la carpeta y guarda.
- Rellenar el formulario: Solicitud de cambio y Trabajo realizado abren una página de formulario (abajo) y luego crean el archivo.
- Abrir Plan o Abrir Estimaciones: el informe necesita una elección que haces en esa página. El enlace abre la página; exporta desde allí.

Un informe se muestra solo cuando tu rol puede ver la página que contiene su exportación. El informe Flujos de red se muestra cuando el proyecto tiene un archivo de flujos. Cuando no queda ningún informe, Informes no tiene ficha. El menú Exportar de cada página funciona todavía.

Una página de formulario tiene la dirección `/library/reports/change-request` o `/library/reports/work-done`, y el enlace Informes para volver. Rellena los campos (una solicitud de cambio pide Desde la versión, Hasta la versión y Personas que aprueban: Añadir muestra el equipo con una casilla por persona) y haz clic en Escribir el informe. Un campo obligatorio vacío da una línea de error y no escribe nada. Tras escribir, la tarjeta Escrito muestra cada archivo con su ruta, Mostrar en la carpeta y Abrir. Las tarjetas de la derecha listan los otros informes con formulario, los informes sin formulario (Todos los informes) y las partes del dosier completo.

El selector de formato ofrece también PDF (solo macOS) y Markdown; cada informe de texto puede escribirse en Markdown. Un informe escrito muestra su fecha y su persona, Páginas que enlazan a un informe lista las páginas que lo citan, y Expediente completo pregunta el título, el cliente y la fecha antes de escribir.

### Manual

Manual es esta guía. Ábrelo con Manual en el menú de la cuenta, con F1, con la barra Preguntar o con la ficha Manual de Biblioteca. Viene con la aplicación, en el idioma de la interfaz, y funciona sin proyecto. Escribe una palabra en el campo de búsqueda para encontrar cada sección que la contiene. Abrir el manual de esta página, en la barra Preguntar, abre la página del lugar y la sección que ves.

El manual tiene una página por lugar, en el orden de la barra lateral, y se abre en Inicio. Cada página tiene una imagen. F1 abre el manual para cada rol, también para un rol que no ve Biblioteca: el manual es ayuda. Bajo una página, Preguntar sobre esta página pone una pregunta sobre la página en el asistente, Atajos abre los atajos de teclado, y Guía del proyecto abre la guía del proyecto.

Un enlace en el texto de una página, como `adr:0003`, abre una tarjeta que lo explica. La tarjeta dice si el elemento está en el proyecto y a qué está vinculado. Abrir y Explicar con un agente están lado a lado. Más muestra las otras acciones, y Copiar la referencia copia el nombre del elemento.
