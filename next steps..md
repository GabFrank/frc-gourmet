ejecutar en compose:
do not use direct function calls on html like getNombreCajero(caja), why do you complicate it? its a lot easier and less code to only put
{{caja.dispositivo?.usuario?.nombre || 'Sin asignar'}} directly on html
also, Nueva Caja button should open @create-caja-dialog.component.ts 