  {
    path: 'ingredientes',
    loadComponent: () => import('./pages/productos/ingredientes/list-ingredientes.component').then(m => m.ListIngredientesComponent),
    title: 'Ingredientes'
  },
  {
    path: 'recetas',
    loadComponent: () => import('./pages/productos/recetas/list-recetas.component').then(m => m.ListRecetasComponent),
    title: 'Recetas'
  }
]
