# Configuración

Configuración contiene los ajustes. Cada ajuste tiene un solo sitio, en uno de tres ámbitos: Este proyecto, Este ordenador y Yo. El selector tiene cuatro secciones: Inicio, Este proyecto, Este ordenador y Yo. Una página que abre una puerta tiene un enlace de vuelta a su ámbito.

## Inicio

Inicio es el inicio guiado: cada paso de la lista Empezar, una pregunta cada vez. Omitir va al siguiente paso por hacer. Tres puertas abren los ámbitos.

## Este proyecto

Este proyecto contiene lo que el proyecto guarda y comparte con el equipo. Cuatro pestañas abren sus páginas: Detalles, Lo que los agentes hacen solos, Automatización y Extensiones. Conexiones, Tickets y Salud de este proyecto se abren desde Detalles.

El formulario del proyecto contiene el nombre y el logo (el logo se muestra junto al nombre del proyecto, en lo alto de la barra lateral), las carpetas del proyecto, la receta predeterminada, la automatización y la importación del proyecto. Los ajustes que se cambian poco están en Avanzado. La misma página restaura los cambios apartados (stashes), muestra lo que contienen, y pone al día una rama que va por detrás del servidor.

- Automatización: Cuántos a la vez tiene un límite para este equipo y para este proyecto. También tiene Plan, Construir y Revisión: cada límite es el número de ejecuciones del proyecto que pueden estar en esa etapa a la vez, y una ejecución espera donde está mientras su siguiente etapa está llena. Una ejecución en pausa conserva su lugar. Los interruptores dejan que los agentes hagan push, abran una pull request, muevan un ticket y lo comenten sin clic. Con un interruptor desactivado, cada escritura de ese tipo espera tu aprobación.
- Permisos de una receta: «No volver a preguntar por esta receta» en una aprobación permite exactamente los tipos de sus efectos (por ejemplo `transition` y `open_pr`) solo para las ejecuciones de esa receta. Otro tipo sigue esperando. El grupo Automatización lista cada receta con un permiso: Quitar retira un tipo con Guardar, y la siguiente escritura de ese tipo te espera de nuevo. Un guardado nunca añade un permiso. Solo Solo, en la página de un paso de pull request, lo hace, con tu clic. Un push forzado siempre te espera. El archivo los guarda en `recipe_writes` de `.shipyard/automation.yaml`. El archivo es compartido: cada compañero necesita una versión de Shipyard que lea `recipe_writes`, si no el archivo no es válido para ese compañero y su sincronización se detiene.
- Idiomas: el idioma de la documentación y el idioma de las pull requests fijan el idioma de las especificaciones, los documentos y el texto de las pull requests de los agentes. El código y los comentarios quedan en inglés. Un cambio vale solo para el siguiente encargo de agente y la siguiente pull request.
- Revisión por un agente de cada pull request: Desactivada, Borrador o Publicar. Borrador guarda una revisión para que la leas y la publiques, una por cada commit de cabeza nuevo. Publicar añade por sí solo una revisión en comentario y nunca aprueba.
- El tema del proyecto: cuando el proyecto fija un tema, gana a tu propio tema.

La lista `docs` del archivo del proyecto dice qué documentos siguen a qué código. Cada regla tiene `code` (patrones de ruta) y `feeds` (carpetas o rutas de documentación), y un `name` opcional. Sin la lista, las especificaciones alimentan las otras carpetas de documentación.

```yaml
docs:
  - name: crates
    code: ["crates/*/Cargo.toml"]
    feeds: [models]
```

### Conexiones

Conexiones enlaza el proyecto con su gestor de tickets y su plataforma de código: Jira, GitHub, GitLab, Azure DevOps y Linear. Haz clic en Añadir, elige el producto y pega un token. La aplicación abre la página que crea el token. Una prueba se ejecuta al guardar. Un token va al llavero de tu ordenador. La aplicación no lo muestra nunca más.

Herramientas de GitLab: inicia sesión en GitLab con el navegador. El interruptor Herramientas de GitLab añade entonces el servidor MCP de GitLab de esa plataforma de código para el asistente. Usa el mismo inicio de sesión y ningún otro token. Una conexión que inició sesión antes muestra una vez Iniciar sesión de nuevo. El servidor necesita GitLab 18.3 o posterior y acceso a MCP para tu grupo o tu instancia.

### Tickets

Tickets fija qué conexión a un gestor de tickets y qué alcance dan los tickets del proyecto.

### Extensiones

Extensiones contiene el catálogo, los plugins y los proyectos hijos.

- Catálogo: partes listas para usar. Haz clic en Desplegar para añadir una al proyecto.
- Plugins: un plugin es un archivo .zip. La aplicación lo lee como datos y lista cada archivo y cada ajuste. Escribe solo los elementos que aceptas. Haz clic en Ajustes de un plugin instalado para rellenar sus ajustes en un formulario, y guarda: los archivos que los valores nuevos cambian se muestran en la revisión. Para escribir un plugin, haz clic en Nuevo plugin (copia un ejemplo y lo abre como proyecto), edítalo, haz clic en Probar en este proyecto para ver la revisión de una carpeta, y haz clic en Empaquetar para crear el .zip. Un fallo en manifest.json se muestra con su línea; haz clic en él para abrir esa línea. Un plugin puede añadir skills, reglas, temas e idiomas, y puede usar {{config.<key>}} en archivos de texto. Un tema va a la biblioteca de temas de este ordenador (consulta Temas).
- Proyectos hijos: otros proyectos que toman las mismas reglas. Clona un hijo y haz clic en Desplegar. La aplicación crea una rama y un commit en el clon. Nunca hace push.

### Salud de este proyecto

Salud de este proyecto lista los problemas del proyecto. Cada problema tiene un botón que lo corrige. Inspeccionar muestra la rama y los cambios de un proyecto enlazado.

Corregir todo con un agente crea una funcionalidad en Flujo con los hallazgos en su Encargo, e inicia una ejecución con el presupuesto de la receta. Sin presupuesto, el botón está desactivado. El ticket de la corrección tiene la etiqueta `health-fix`. La ejecución pasa la misma revisión y las mismas aprobaciones que cualquier otra funcionalidad, y Detener la termina. Los hallazgos sobre las herramientas de este ordenador no están en la corrección.

## Este ordenador

Este ordenador contiene lo que esta máquina guarda: las herramientas de IA, los proveedores de modelos, los servidores MCP, los certificados y los permisos del sistema con Repetir el recorrido (consulta Primeros pasos, Permisos). Tres pestañas abren sus páginas: Herramientas de IA y conexiones, Modelos y reglas y Salud. Compartir Shipyard con otras herramientas y Registros y comentarios se abren desde filas.

- Servidores MCP: las herramientas que los agentes pueden llamar. Están agrupados por categoría. Haz clic en Añadir el conjunto recomendado para activar los servidores que convienen al proyecto. Haz clic en Probar en un servidor, o en Probar todo, para ver si cada uno funciona y cuántas herramientas da. Cada servidor tiene una Lista de permitidas: Todas las herramientas, Solo lectura (las herramientas que el servidor marca como de solo lectura, si no ninguna) o Personalizada, donde marcas las herramientas. Una herramienta que no está en la lista queda oculta para los agentes y se rechaza al llamarla.
- Servidor MCP personalizado: elige Personalizado en Añadir, o pega el JSON (`mcpServers`) de un servidor en Pegar JSON. Un valor secreto va al llavero, no a un archivo. Un secreto en los argumentos se rechaza: muévelo a las variables.

### Agentes y reglas

Agentes y reglas contiene las herramientas de IA, los proveedores de modelos, y las reglas y las skills de los agentes.

1. Haz clic en Instalar el contrato para escribir las reglas de agente en el proyecto.
2. En Objetivos, elige lo que quieres: por ejemplo Calidad del código o Especificaciones primero. Haz clic en Aplicar. La aplicación activa las skills que convienen al proyecto.
3. En Skills externas, cada origen muestra su estado: Al día, Actualización lista, Editada o No está en este proyecto. Un origen que instalaste para ti (tus carpetas de skills o un plugin de agente) y que el proyecto no contiene muestra En tu equipo: Instalar lo añade al proyecto para el equipo. Haz clic en Actualizar las skills externas para tomar las actualizaciones. Haz clic en Reinstalar para restaurar los archivos originales de un origen.

La aplicación conserva cada archivo que una persona cambió, salvo si reinstalas.

Los roles de agente muestran la descripción y el modelo de cada rol: El mejor, Estándar o Rápido. El cambio de un rol incluido que no tiene archivo de proyecto escribe el archivo de proyecto de ese rol.

### Herramientas de IA

La lista muestra cada herramienta de código que la aplicación conoce: Claude Code, Codex, GitHub Copilot, OpenCode y Gemini CLI (el programa `agy` cuenta como Gemini CLI). Cada fila muestra el nombre, la versión, el estado y una acción.

- Sesión iniciada: la herramienta está lista. La fila no tiene acción.
- Sesión cerrada: haz clic en Iniciar sesión. El cajón del terminal se abre y ejecuta el inicio de sesión de la herramienta. Termina en el navegador. El estado cambia cuando el inicio de sesión termina. Para Codex, haz clic en Usar un código para iniciar sesión con un código.
- Sin comprobar: Copilot, OpenCode y Gemini CLI no tienen un comando de estado que la aplicación pueda leer. Haz clic en Iniciar sesión. Cuando una ejecución de una de estas herramientas falla porque no tiene sesión iniciada, la fila muestra Sesión cerrada.
- No instalada: haz clic en Instalar.

La aplicación pregunta su estado a la herramienta y nunca lee sus archivos de tokens ni sus entradas del llavero.

### Proveedores de IA

Bajo las herramientas, una fila lista cada proveedor.

- OpenRouter: haz clic en Iniciar sesión. El navegador se abre. Aprueba allí, y la aplicación guarda la clave en el llavero. Haz clic en Cancelar para detener la espera. La espera termina después de 10 minutos.
- Ollama, LM Studio, vLLM y LiteLLM: la aplicación busca solo en esta máquina. Un motor que responde muestra una fila con Añadir. Añadir crea un proveedor sin clave.
- OpenAI, Anthropic, Mistral, Google AI Studio y Azure OpenAI: haz clic en Obtener una clave para abrir la página de claves del proveedor. Haz clic en Pegar clave, pega la clave y haz clic en Guardar (o pulsa Intro). La aplicación prueba primero la clave. Una clave que falla no se guarda, y la fila muestra el motivo y qué hacer. Azure OpenAI pide también la dirección de tu recurso.

Una clave va solo al llavero. Nunca va a un archivo, un registro o una dirección.

### Agentes externos

Shipyard puede servir sus herramientas a un agente que inicias tú mismo. Activa el servidor, elige los grupos de herramientas, y mira Herramientas de agente. Lista Claude Code, Codex, Gemini y VS Code cuando los encuentra, cada uno como Conectada, Desactualizada o No conectada. Haz clic en Conectar para ver el archivo tal como se escribiría. El archivo cambia solo cuando haces clic en Escribir el archivo, y el resto del archivo se queda. Después de cambiar el puerto, una herramienta conectada muestra Desactualizada: haz clic en Actualizar. La Lista de permitidas tiene dos ajustes predefinidos, Todas las herramientas y Solo lectura, y puedes elegir las herramientas una a una. Las skills del proyecto son prompts MCP y los archivos del proyecto son recursos MCP, mientras Leer archivos está activado.

### Salud de este ordenador

Salud de este ordenador lista los problemas de las herramientas de esta máquina. Cada problema tiene un botón que lo corrige. La entrada Salud del menú de la cuenta abre el ámbito del hallazgo más grave.

### Registros y comentarios

Registros y comentarios muestra los registros de la aplicación. Abrir en el correo abre tu aplicación de correo con tus comentarios.

Adjuntar un archivo muestra el archivo en el gestor de archivos, junto al texto de tus comentarios. Shipyard no envía nada.

## Yo

Yo contiene tus propios ajustes. Valen en cada proyecto.

- Tema: Claro, Oscuro, OLED, Sistema, «Sistema, OLED en oscuro» o un tema que importaste. Archivos de tema importa un tema con una vista previa, y exporta el tema actual; consulta la página Temas.
- Densidad, contraste, tamaño del texto y rol.
- Idioma: inglés, francés, alemán, español o un idioma que importaste. Archivos de idioma importa un archivo de idioma: Shipyard lista cada fallo, o muestra cuántos textos traduce antes de Añadir. Exportar inglés escribe cada texto en inglés, como inicio de un idioma nuevo: cambia el código, el nombre y los textos. Un texto que un archivo de idioma no traduce se muestra en inglés, y Marcar texto sin traducir muestra cada uno con una marca.
- Animaciones: Según el sistema o Reducir. El ajuste del sistema o Reducir detiene cada animación.
- Anillo de foco: Con el teclado o Siempre, de 2 o 3 px de ancho. Una vista previa al lado muestra la elección enseguida.
- El elemento de la barra de menús: activado o desactivado.
- Un rol sin acceso a los ajustes del proyecto tiene aquí los permisos del sistema y Repetir el recorrido.

Notificaciones: cada origen tiene su propio interruptor, activado por defecto. Los orígenes son una pregunta, una aprobación, una ejecución que te espera, una sincronización fallida, una actualización, una rama remota movida, una ejecución que termina, los controles de tus pull requests, un escaneo fallido que no iniciaste, y un borrador de revisión de agente listo para publicar. Un interruptor desactivado detiene la entrada en Novedades y el aviso del sistema. El sistema muestra un aviso mientras la ventana está en segundo plano.

Aviso de presupuesto: se muestra una notificación cuando un presupuesto llega a su umbral de aviso. El interruptor Sonido activa o desactiva el sonido de un aviso del sistema. El canal de versiones es Estable o Vista previa: Vista previa también considera las prerrelease de la misma dirección de versiones.

Cerrar sesión está junto a tu nombre y al final del menú de la cuenta. Tras tu confirmación, quita de este ordenador el inicio de sesión del alojamiento de código y del gestor de incidencias. El inicio de sesión de una herramienta de IA o de OpenRouter se mantiene.

En el primer inicio, y cada vez que falta un permiso, una tarjeta «Shipyard necesita N permisos» lista los permisos que faltan con Permitir, Más tarde y Permitir todo.

### Vistas por rol

Vistas por rol está en `/setup/role-views`. Todas las vistas por rol, en la página de los paneles de Hoy, la abre. Muestra una tarjeta por rol: la página en la que empieza el rol (Empieza en Flujo, por ejemplo) y los lugares que el rol ve. Un lugar que el rol no ve aparece tachado. La tarjeta de tu rol lleva la etiqueta Mi vista, y el rol de lector se llama Solo miro. El botón Derechos de cada rol abre Equipo / Derechos, donde se fijan los derechos. Las tarjetas son iguales en cada proyecto que tiene los mismos derechos.

### Aspecto y disposición

Aspecto y disposición contiene las fuentes, el lado de la barra y de los cajones, el color de acento, el formato de fecha y tu foto.

Cambiar, junto a la carpeta de datos, mueve los datos a la carpeta que elijas, tras tu confirmación, y reinicia Shipyard. El interruptor Modo portátil escribe o quita la marca `portable` junto a la aplicación. Los datos se mueven en el siguiente inicio, antes de que Shipyard abra sus archivos. Si la copia falla, Shipyard conserva la carpeta anterior.

## Añadir un tipo de ticket

Setup / Tickets tiene Añadir tras los tipos. Escriba el tipo, elija el tipo que lo contiene y pulse Añadir. El tipo debe existir en el gestor de tickets, o Añadir lo rechaza. La jerarquía muestra entonces el tipo bajo su padre.
