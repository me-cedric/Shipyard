# Proyectos

Proyectos lista los proyectos de este ordenador. Haz clic en el nombre del proyecto en lo alto de la barra lateral, y luego en Proyectos, para abrirla. La página muestra el proyecto abierto como una tarjeta, con lo que te espera y los agentes en curso, y después los proyectos abiertos antes en Abiertos antes.

Los botones de la página son Importar proyectos (abre Configuración / Este proyecto), Abrir una carpeta, Clonar desde la plataforma de código y Nuevo proyecto. También puedes soltar una carpeta en la página. Una tarjeta tiene Abrir, y Cerrar para el proyecto abierto o Quitar de la lista para otro. El botón de tres puntos Detalles muestra la carpeta, la plataforma de código, la rama y el último commit del proyecto.

## Abrir un proyecto

1. Haz clic en Abrir en una tarjeta de Abiertos antes para abrir ese proyecto.
2. O haz clic en Abrir una carpeta y elige la carpeta de tu proyecto. Cuando la carpeta no es todavía un proyecto, haz clic en Convertir en proyecto.
3. O haz clic en Clonar desde la plataforma de código y da su dirección.

Cerrar pregunta primero cuando hay agentes trabajando para el proyecto: Cancelar, Detenerlos y cerrar, o Dejarlos trabajar. Dejarlos trabajar cierra el proyecto y las ejecuciones siguen.

## Nuevo proyecto

Nuevo proyecto es una página propia, en `/projects/new`. Ábrela con Nuevo proyecto en la página Proyectos, en la página del primer inicio o en la página No hay ningún proyecto abierto. Hace una pregunta cada vez, en cinco pasos: Nombre, Tipo de producto, Herramientas, Equipo y Listo. Todos los pasos muestra las cinco partes en una página: Proyecto, Encargo, Equipo, Dónde vive el código e Inicio. Atrás sale de la página o vuelve un paso. Cada paso tiene valores por defecto. Crear el proyecto está activo cuando el nombre y la carpeta superior están fijados. No se hace nada antes de tu clic.

1. Proyecto: el nombre, la clave corta para los tickets (a partir del nombre, puedes editarla), la carpeta superior y la tecnología: Node, Rust, Python, Java, Go u Otra. La tecnología fija los controles del archivo del proyecto y las reglas de exclusión de `.gitignore`. La carpeta debe estar vacía o ser nueva: Crear el proyecto rechaza una carpeta que contiene archivos.
2. Encargo: la visión, los usuarios y el alcance, como texto que editas. Van a `docs/brief.md`. Elige también el idioma de la documentación y el idioma de las pull requests. Los dos toman por defecto el idioma de la interfaz. Los agentes escriben las especificaciones, los diagramas, los documentos y el texto de las pull requests en estos idiomas. El código, los identificadores, los comentarios de código y los mensajes de commit quedan en inglés.
3. Equipo: eres el primer miembro, con un rol. Añade miembros con un nombre y un rol. Quitar saca a un miembro; está desactivado en la primera fila (tú), con su motivo.
4. Dónde vive el código: Solo en este ordenador (por defecto), una dirección remota existente, o un repositorio privado nuevo en una conexión a una plataforma de código (GitHub o GitLab). No se ofrece un repositorio público. Elige también una conexión a un gestor de tickets y su alcance.
5. Inicio: la lista de los archivos que escribe Shipyard, con su texto. No se escribe nada antes de que hagas clic en Crear el proyecto. Después elige un inicio:
   - Iniciar un agente: una ejecución de la receta `bootstrap`, con un plan que espera tu aprobación, una construcción, una revisión y una pull request. Necesita una conexión a una plataforma de código.
   - Crear los tickets: un ticket por cada línea del alcance. Ves, editas y quitas cada uno primero. Necesitan una conexión a un gestor de tickets. Shipyard crea los tickets solo cuando haces clic en Crear los tickets, y un segundo clic no crea ninguna copia.
   - Más tarde.

   La opción por defecto es el agente cuando es posible, si no los tickets, si no más tarde.

Crear el proyecto crea el repositorio, escribe los archivos, hace el primer commit y abre el proyecto. El proyecto se crea al final de los pasos, no antes. Para un repositorio nuevo, crea después el repositorio en la plataforma de código, fija `origin` y hace push. Cuando la plataforma de código lo rechaza, el proyecto local queda abierto y el error se muestra.

## Ningún proyecto abierto

Cuando cierras el proyecto, o cuando no hay ningún proyecto abierto tras el primer inicio, una tarjeta dice No hay ningún proyecto abierto. Nuevo proyecto abre la página del creador. Abrir un proyecto abre un menú: tus proyectos recientes, Proyectos, Abrir una carpeta y Clonar un repositorio. La página del primer inicio sirve solo para el primer inicio (consulta Primeros pasos, Primer inicio).

## Ajustes del proyecto

Configuración / Este proyecto contiene el nombre y el logo del proyecto, sus conexiones y su salud. Consulta la página Configuración.
