productos:
<- presentacion
<- producto_observacion
<- costo

producto_observacion:
-> observacion
-> grupo_observacion

grupo_observacion_detalle
-> grupo_observacion
-> observacio

presentacion:
-> producto
<- codigo
<- precio
-> variacion

variacion:
<- variacion_item
<- variacion_adicional
-> receta

variacion_item:
-> ingrediente

variacion_adicional:
-> variacion
-> adicional

ingrediente:
-> variacion

where:
entity_a:
-> entity_b
means that entity_a have a relation with entity_b

entity_a:
<- entity_b
means that entity_b have a relation with entity_a


