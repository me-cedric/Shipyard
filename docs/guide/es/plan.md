# Plan

Plan contiene el cronograma, la carga de las personas, las estimaciones y el tiempo. El selector tiene cuatro secciones: Cronograma, Personas, Estimaciones y Tiempo. Cronograma, Personas y Estimaciones comparten una hoja de estimación: la hoja queda en la dirección.

## Cronograma

Cronograma dibuja el cronograma de un lote como diagrama de Gantt, a partir de una hoja de estimación, el equipo y el calendario. El título da el día en que termina la versión.

- Fechas y días libres fija los días laborables y los festivos.
- Exporta el diagrama como imagen.

Cuando una persona tiene demasiado trabajo, una tarjeta nombra el problema y lista propuestas: una tarea pasa a una persona del mismo rol con margen, o empieza más tarde. Aplicar hace una propuesta. Reequilibrar hace cada una.

## Personas

Personas muestra cada persona con su carga frente a la capacidad de cada semana, las tareas y sus fechas. Una persona con demasiado trabajo tiene allí también las propuestas. Enviar al gestor de tickets abre una página con una vista previa primero: Nuevo, Cambiado y Sigue igual, cada uno con su número. Nada va al gestor de tickets antes de que hagas clic en Aplicar.

## Estimaciones

Estimaciones contiene una hoja por lote. Cada fila tiene una estimación baja, probable y alta. La aplicación calcula el precio, el coste y el margen a partir de las tarifas diarias. Un selector muestra la hoja como Backlog, Resumen, Reparto, Cartera o Costes.

- Duplica, renombra, congela o elimina una hoja desde su menú.
- Sella el proyecto con una frase de contraseña para ocultar las tarifas diarias en los archivos.
- Pedir una estimación a un agente: selecciona tareas y haz clic en ello. El agente propone un valor Mejor caso, Probable y Peor caso con sus supuestos. Un valor entra en la hoja solo cuando haces clic en Aceptar. Descartar abandona la propuesta. El agente se muestra en Equipo / Sesiones mientras trabaja. Detener lo termina, y la hoja conserva sus valores. La acción está desactivada en una hoja sellada y en una hoja congelada.

## Tiempo

Una cuadrícula de la semana muestra una fila por ticket y una columna por día. Escribe las horas en una celda para añadir o cambiar un registro. Vacía la celda para eliminar el registro, después de confirmar. Una celda con dos registros o más muestra la suma: cámbialos en la lista del mes.

Bajo la cuadrícula, el mes lista el tiempo que dedicó cada persona. La aplicación envía un registro de tiempo al gestor de tickets solo después de tu clic.

Haz clic en Leer el mes para leer los registros de tiempo del mes en el gestor de tickets, junto a tus registros. Esto no cambia nada.

Un rol con menos de tres miembros con tarifa diaria no muestra ningún coste. Con una o dos tarifas, un coste mostraría la tarifa de una persona.

## Páginas

Una subpágina tiene su propia dirección y un enlace de vuelta. Estimaciones guarda también su hoja en la dirección.

- Cronograma: `/plan/timeline`. Fechas y días libres está en `?page=dates`.
- Personas: `/plan/people`. Enviar al gestor de tickets está en `?page=send`.
- Tiempo: `/plan/time`.
- Estimaciones: `/plan/estimates`. Las vistas son `?tab=summary` (hojas) y `?tab=costing`. Una estimación se abre en `?task=<id>` y la importación desde Excel en `?page=import`. La búsqueda, los filtros, las columnas y las acciones de la hoja están en el menú Más.
