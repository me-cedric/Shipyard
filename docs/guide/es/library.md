# Biblioteca

Biblioteca contiene las páginas que describen el proyecto: qué debe hacer, cómo está construido, por qué es así, y lo que el equipo aprende y comparte. Cada elemento es un archivo del proyecto.

Biblioteca se abre con cuatro puertas. Cada puerta nombra lo que buscas, y contiene una ficha por página. Haz clic en una ficha para abrir su página. Cuando algo te espera, una ficha naranja va primero y da el número: las preguntas abiertas, o las decisiones en espera. Una ficha marca una página cuyo origen cambió después. Una página que tu rol no puede ver no tiene ficha.

Biblioteca no tiene selector de secciones. En cada página de Biblioteca, haz clic en Biblioteca arriba para volver a las puertas.

## Leer y cambiar un elemento

1. Abre una página y selecciona un elemento. O haz clic en la acción principal de la página para crear uno. Selecciona un elemento para ver, en el inspector, los elementos que lo citan.
2. Un elemento con una imagen se abre solo con la imagen. Un selector arriba tiene tres opciones: Imagen, Ambos (el texto y la imagen lado a lado) y Texto. Un documento tiene Lectura, Ambos y Texto. Shipyard conserva tu elección. Muestra el texto por sí solo para un archivo nuevo, cuando alguien cambió el archivo al mismo tiempo, y para un error que nombra una línea.
3. Cambia el texto o el dibujo, y haz clic en Guardar. La aplicación escribe el archivo entero o nada.

- Buscar: las listas tienen un campo Buscar. Usa la misma búsqueda que la barra Preguntar.
- Eliminar: abre el menú de un elemento (clic derecho) y elige Eliminar, o haz clic en Eliminar en el inspector. La aplicación nombra el archivo y pregunta una vez. El archivo va después a la papelera.
- Renombrar: el menú del elemento tiene Renombrar. Escribe el nombre nuevo; la extensión se queda. La revisión lista cada archivo y cada línea cuyos enlaces cambian. Renombrar mueve después el archivo y reescribe esos enlaces en un paso. Si una escritura falla, cada archivo queda como estaba.
- Preguntar al asistente: el último grupo del menú del elemento. Elige una petición para este tipo de elemento y tu rol. Rellena el cuadro de mensaje con el elemento, su archivo, su especificación, su ticket y los elementos que lo citan. No se envía nada hasta que lo envías.
- Cuando alguien cambia el archivo al mismo tiempo, la aplicación te lo dice. Elige Recargar para tomar su versión, o Conservar el mío.
- Un proyecto de solo lectura rechaza el guardado, la eliminación y el cambio de nombre.

## Qué debe hacer

### Especificaciones

Especificaciones lista lo que el producto hace hoy, con los requisitos de cada especificación. Un cambio de una especificación empieza como propuesta: consulta la página Flujo, Lista y La página de una funcionalidad, Encargo.

### Planes de pruebas

Planes de pruebas lista los escenarios de prueba. Cada escenario nombra los requisitos que comprueba. Un plan se abre en Lectura: una tarjeta por escenario, con sus pasos y sus etiquetas. Haz clic en Editar para cambiar su texto. Un plan sin escenario se abre en su texto. Un hallazgo del control abre el plan en su texto, en su línea.

### Preguntas

Preguntas es el registro de los puntos abiertos: riesgos, supuestos, problemas, dependencias y preguntas.

- Filtra por tipo, estado y responsable.
- Haz clic en Nueva pregunta para añadir una. Elige el responsable en el equipo.
- Después de responder a una pregunta de una especificación, un clic copia la respuesta en la especificación.

## Cómo está construido

### Mapa

Mapa dibuja los elementos del proyecto y los enlaces entre ellos. Filtra por tipo. Una vista de tabla lista los mismos elementos.

- Un elemento que nada cita se muestra como huérfano.
- Un elemento cuyo origen cambió después se muestra como desactualizado.
- Selecciona un elemento para abrirlo en el inspector.

Con el origen Código, el mapa muestra las carpetas del código. Una línea entre dos carpetas es más gruesa cuando hay más llamadas entre sus archivos. Selecciona una carpeta para ver sus archivos, y luego un archivo para ver sus símbolos y qué los llama o qué llaman. Mostrar todo vuelve al mapa. Índice inicia el servidor de índice del código cuando está apagado, construye el índice y detiene el servidor. Si el programa termina con un error, la página nombra el programa, su código de salida y sus últimas líneas: corrige la causa y haz clic de nuevo en Índice.

### Arquitectura

Arquitectura muestra los modelos de arquitectura del proyecto como vistas. Las vistas se dibujan a partir del texto del modelo.

Un diagrama o una imagen, en Arquitectura y en Pantallas, se ajusta a su marco y queda en el centro al abrirse. Para moverlo:

- Desplazar: arrástralo, o usa un gesto lateral en el panel táctil. Una rueda vertical desplaza la página.
- Zoom: pellizca, o mantén Ctrl o Cmd y gira la rueda.
- Teclado: haz clic en el marco para darle el foco, y pulsa las flechas para desplazar, + o - para el zoom y 0 para ajustar.
- Ajustar devuelve todo el diagrama al marco.

### Diagramas

Diagramas contiene los dibujos del proyecto: Excalidraw, Mermaid, draw.io y BPMN. Dibuja en el editor y guarda.

### Pantallas

Pantallas muestra las pantallas del producto y los tokens de diseño de tu proyecto. Vienen del documento de diseño (CSS en un bloque de código), de un archivo `tokens.css`, de un archivo `*.tokens.json` o de un bloque `@theme` de Tailwind 4, agrupados por archivo. Sin tokens la página dice Aún no hay tokens; haz clic en Añadir tokens al documento de diseño, edita el bloque y guarda. La página nunca muestra los tokens de Shipyard.

- Un archivo `.fig` muestra la vista previa que Figma guarda en él.
- Para leer Figma, añade una vez el token de tu cuenta de Figma. Va al llavero de tu ordenador.
- Después pega la dirección de un proyecto de Figma y haz clic en Listar los archivos. Cada archivo muestra su vista previa y sus tokens de diseño.

### API

API muestra los contratos de API. Abre un contrato para leer sus rutas. Prueba una ruta contra un servidor del contrato.

### Datos

Datos muestra los modelos de datos: las tablas y los enlaces entre ellas.

### Flujos de red

Flujos de red lista los flujos de red como tabla: de dónde, a dónde, el puerto y el protocolo. Añade, cambia o quita una fila, y guarda.

## Por qué es así

### Decisiones

Decisiones contiene los registros de decisión (ADR). Cada registro da una decisión, las opciones y los motivos.

- Haz clic en Nueva decisión para escribir una. Un formulario pide cada parte.
- Acepta o rechaza una decisión propuesta con un clic.

### Reglas del proyecto

Reglas del proyecto contiene las reglas del proyecto que cada cambio debe seguir.

## Aprender y compartir

### Aprender

Aprender ayuda a una persona nueva a orientarse.

- Ruta: la arquitectura, las decisiones y luego las especificaciones, en orden de lectura. Un paso que abres cuenta como hecho.
- Glosario: las palabras que las especificaciones definen.
- Rutas de aprendizaje: cursos, certificaciones y lecturas, con los expertos del equipo que pueden ayudar. Elige una persona y marca los pasos que esa persona terminó. La tabla de progreso del equipo muestra cada persona y cada ruta.
- Canales: los canales de noticias del proyecto. Pega la dirección RSS o Atom de un sitio y haz clic en Suscribirse. La aplicación lee cada canal y guarda una copia durante una hora.

### Guía del equipo

Guía del equipo contiene las páginas de la guía del proyecto. Lee una página con su índice al lado, o pasa a Edición para cambiarla. En Edición, el selector Lectura, Ambos, Texto muestra la página como la lees, la página junto a su texto, o solo el texto. Haz clic en Nueva página para añadir una.

### Documentos

Documentos lista los documentos del proyecto. Busca en su texto, renómbralos, elimínalos, y lee un archivo Word. Exporta el dosier de arquitectura y la documentación funcional como archivos Word, y una ficha de cliente como archivo Excel. Cada exportación abre un diálogo Guardar como con el nombre rellenado y la carpeta de tu último guardado; Cancelar no exporta nada. Después de guardar, Mostrar en la carpeta y Abrir actúan sobre el archivo nuevo.

Un archivo Word tiene una portada, un índice (Word rellena los números de página cuando pide actualizar los campos), los diagramas Mermaid del proyecto como imágenes, y números de página. Un archivo LikeC4 o draw.io se muestra como imagen cuando hay un PNG con el mismo nombre a su lado, y si no como su ruta. Una hoja Excel tiene una fila de cabecera con estilo que queda en pantalla.

### Diapositivas

Diapositivas contiene las presentaciones del proyecto. Cada presentación es un archivo HTML en `docs/slides/`, con sus animaciones y sus pasos.

- Nueva presentación: escribe un nombre. El asistente se abre con una petición a un agente para escribir la presentación. Lee la petición y envíala.
- Haz clic en una presentación para mostrarla. Las flechas, Espacio, Inicio y Fin recorren las diapositivas y los pasos.
- Presentar muestra la presentación a pantalla completa. Pulsa Escape para parar.
- Exportar PDF: elige el archivo en el diálogo Guardar como. Cada diapositiva pasa a ser una página. Esto funciona solo en macOS.
- Una presentación antigua escrita como texto se muestra en solo lectura. Haz clic en Convertir para pedir a un agente que la reescriba como presentación HTML.
- Para eliminar una presentación, abre su menú y haz clic en Eliminar. El archivo va a la papelera.

### Paneles

Paneles contiene tableros de mosaicos: trabajo, ejecuciones, preguntas, calidad y más. Añade o quita un mosaico, cambia sus ajustes, y guarda. Mostrar como tabla da los números detrás de un gráfico. Arrastra un mosaico a otra columna, o usa sus botones Mover a la izquierda y Mover a la derecha. Los mosaicos que fijas se muestran arriba en Paneles. Un mosaico cuyo origen está desactivado lo dice.

Crear un mosaico para mí pide a un agente que proponga un mosaico a partir de tus palabras. No necesitas conocer los tipos de mosaicos.

1. Haz clic en Crear un mosaico para mí, junto a Añadir mosaico.
2. Escribe lo que debe mostrar el mosaico, en palabras sencillas. Por ejemplo: las preguntas abiertas por responsable.
3. Presupuesto (USD) es el límite del agente: el agente se detiene en el presupuesto, o después de 2 minutos. Su última respuesta puede pasar un poco del presupuesto. El presupuesto empieza en 2 dólares. Menos presupuesto y Más presupuesto lo cambian en 1 dólar.
4. Haz clic en Crear. Mientras el agente trabaja, Detener lo termina. El trabajo se muestra también en Equipo / Sesiones, y su Detener hace lo mismo.
5. Mira el Mosaico propuesto. Aceptar lo añade al panel y guarda. Descartar lo abandona.

El agente solo lee el proyecto. El panel no cambia hasta que haces clic en Aceptar. Si la página dice que el presupuesto se agotó, añade presupuesto y haz clic de nuevo en Crear. Un panel que no puedes cambiar no tiene Crear un mosaico para mí.

### Informes

Informes lista cada archivo que Shipyard puede crear para una persona que no usa Shipyard: un cliente, un responsable, un auditor. Cada informe es una tarjeta. Formato, arriba, muestra Todos los informes, o solo los archivos Word, los archivos Excel o las imágenes.

- Exportar: Shipyard abre el diálogo Guardar como. Elige la carpeta y guarda.
- Rellenar el formulario: Solicitud de cambio y Trabajo realizado piden primero unos valores, y luego crean el archivo.
- Abrir Plan o Abrir Estimaciones: el informe necesita una elección que haces en esa página. El enlace abre la página; exporta desde allí.

Un informe se muestra solo cuando tu rol puede ver la página que contiene su exportación. El informe Flujos de red se muestra cuando el proyecto tiene un archivo de flujos. Cuando no queda ningún informe, Informes no tiene ficha. El menú Exportar de cada página funciona todavía.

### Manual

Manual es esta guía. Ábrelo con Manual en el menú de la cuenta, con F1, con la barra Preguntar o con la ficha Manual de Biblioteca. Viene con la aplicación, en el idioma de la interfaz, y funciona sin proyecto. Escribe una palabra en el campo de búsqueda para encontrar cada sección que la contiene. Abrir el manual de esta página, en la barra Preguntar, abre la página del lugar y la sección que ves.
