# Proyectos

Proyectos lista los proyectos de este ordenador. Haz clic en el nombre del proyecto en la barra superior para abrirla. Muestra el proyecto abierto ahora, los proyectos abiertos antes con su plataforma de código como distintivo, y las maneras de empezar uno.

Sin proyecto abierto, cada lugar muestra la misma elección: Abrir una carpeta, Clonar un repositorio y Nuevo proyecto.

## Abrir un proyecto

1. Haz clic en un proyecto de la lista para abrirlo.
2. O haz clic en Abrir una carpeta y elige la carpeta de tu proyecto. Cuando la carpeta no es todavía un proyecto, haz clic en Convertir en proyecto.
3. O haz clic en Clonar un repositorio y da su dirección.

## Nuevo proyecto

Haz clic en Nuevo proyecto en la página Proyectos, en la página del primer inicio o en la página sin proyecto. El creador tiene cinco pasos: Proyecto, Encargo, Equipo, Remoto e Inicio. Todos los pasos los muestra en una página. Cada paso tiene valores por defecto. Crear está activo desde el primer paso cuando el nombre y la carpeta superior están fijados.

1. Proyecto: el nombre, la clave (a partir del nombre, puedes editarla), la carpeta superior y la pila: Node, Rust, Python, Java, Go u Otra. La pila fija los controles del archivo del proyecto y las reglas de exclusión de `.gitignore`. La carpeta debe estar vacía o ser nueva: Crear rechaza una carpeta que contiene archivos.
2. Encargo: la visión, los usuarios y el alcance, como texto que editas. Van a `docs/brief.md`. Elige también el idioma de la documentación y el idioma de las pull requests. Los dos toman por defecto el idioma de la interfaz. Los agentes escriben las especificaciones, los diagramas, los documentos y el texto de las pull requests en estos idiomas. El código, los identificadores, los comentarios de código y los mensajes de commit quedan en inglés.
3. Equipo: eres el primer miembro, con un rol. Añade o quita miembros con un nombre y un rol.
4. Remoto: Solo local (por defecto), una dirección remota existente, o un repositorio privado nuevo en una conexión a una plataforma de código (GitHub o GitLab). No se ofrece un repositorio público. Elige también una conexión a un gestor de tickets y su alcance.
5. Inicio: la lista de los archivos que Crear escribe, con su texto. No se escribe nada antes de que hagas clic en Crear. Después elige un inicio:
   - Una ejecución de la receta `bootstrap`: un plan que espera tu aprobación, una construcción, una revisión y una pull request. Necesita una conexión a una plataforma de código.
   - Tickets de inicio: un ticket por cada línea del alcance. Ves, editas y quitas cada uno primero. Necesitan una conexión a un gestor de tickets. Shipyard crea los tickets solo cuando haces clic en Crear los tickets, y un segundo clic no crea ninguna copia.
   - Más tarde.

   La opción por defecto es la ejecución cuando es posible, si no los tickets, si no más tarde.

Crear crea el repositorio, escribe los archivos, hace el primer commit y abre el proyecto. Para un repositorio nuevo, crea después el repositorio en la plataforma de código, fija `origin` y hace push. Cuando la plataforma de código lo rechaza, el proyecto local queda abierto y el error se muestra.

## Ajustes del proyecto

Configuración / Este proyecto contiene el nombre y el logo del proyecto, sus conexiones y su salud. Consulta la página Configuración.
