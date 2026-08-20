import {
  ajustarProporcion,
  calcularTotalesVariacion,
  etiquetaProporcion,
  proporcionesIguales,
  sonProporcionesIguales,
} from './variacion-precio.util';

describe('variacion-precio.util', () => {
  describe('proporcionesIguales', () => {
    it('un solo sabor ocupa la pizza entera', () => {
      expect(proporcionesIguales(1)).toEqual([1]);
    });

    it('dos sabores son mitad y mitad', () => {
      expect(proporcionesIguales(2)).toEqual([0.5, 0.5]);
    });

    it('tres sabores reparten en tercios', () => {
      const p = proporcionesIguales(3);
      expect(p.length).toBe(3);
      expect(p[0]).toBeCloseTo(1 / 3, 3);
    });
  });

  describe('ajustarProporcion', () => {
    it('mueve 10 puntos al sabor elegido y compensa en el otro', () => {
      expect(ajustarProporcion([0.5, 0.5], 0, 10)).toEqual([0.6, 0.4]);
    });

    it('compensa repartido entre los demás', () => {
      const r = ajustarProporcion([0.4, 0.3, 0.3], 0, 10);
      expect(r[0]).toBeCloseTo(0.5, 3);
      expect(r[1]).toBeCloseTo(0.25, 3);
      expect(r[2]).toBeCloseTo(0.25, 3);
    });

    it('la suma se mantiene en 1', () => {
      const r = ajustarProporcion([0.5, 0.5], 0, 30);
      expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    });

    it('topa en 90% y no deja al otro por debajo de 5%', () => {
      const r = ajustarProporcion([0.5, 0.5], 0, 90);
      expect(r[0]).toBeCloseTo(0.9, 3);
      expect(r[1]).toBeGreaterThanOrEqual(0.05);
    });

    it('topa en 10% hacia abajo', () => {
      expect(ajustarProporcion([0.5, 0.5], 0, -90)[0]).toBeCloseTo(0.1, 3);
    });

    it('con un solo sabor no hace nada', () => {
      expect(ajustarProporcion([1], 0, 10)).toEqual([1]);
    });

    it('no muta el array original', () => {
      const orig = [0.5, 0.5];
      ajustarProporcion(orig, 0, 10);
      expect(orig).toEqual([0.5, 0.5]);
    });
  });

  describe('etiquetaProporcion', () => {
    it('un solo sabor no lleva etiqueta', () => {
      expect(etiquetaProporcion([1], 0)).toBe('');
    });

    it('partes iguales muestran fracción', () => {
      expect(etiquetaProporcion([0.5, 0.5], 0)).toBe('1/2');
      expect(etiquetaProporcion(proporcionesIguales(3), 1)).toBe('1/3');
    });

    it('proporciones ajustadas muestran porcentaje', () => {
      expect(etiquetaProporcion([0.6, 0.4], 0)).toBe('60%');
      expect(etiquetaProporcion([0.6, 0.4], 1)).toBe('40%');
    });
  });

  describe('sonProporcionesIguales', () => {
    it('tolera el redondeo de los tercios', () => {
      expect(sonProporcionesIguales(proporcionesIguales(3))).toBe(true);
    });

    it('detecta un reparto manual', () => {
      expect(sonProporcionesIguales([0.6, 0.4])).toBe(false);
    });
  });

  describe('calcularTotalesVariacion', () => {
    const mitadYMitad = [
      { precio: 100000, costo: 40000, adicTotal: 0, proporcion: 0.5 },
      { precio: 80000, costo: 30000, adicTotal: 0, proporcion: 0.5 },
    ];

    it('sin sabores da todo en cero', () => {
      expect(calcularTotalesVariacion([], 'MAYOR_PRECIO')).toEqual({
        precioCalculado: 0,
        totalAdicionales: 0,
        costoCalculado: 0,
      });
    });

    it('MAYOR_PRECIO cobra el sabor más caro', () => {
      expect(calcularTotalesVariacion(mitadYMitad, 'MAYOR_PRECIO').precioCalculado).toBe(100000);
    });

    it('PROMEDIO promedia los precios', () => {
      expect(calcularTotalesVariacion(mitadYMitad, 'PROMEDIO').precioCalculado).toBe(90000);
    });

    it('el precio base no se pondera: la pizza es del mismo tamaño', () => {
      const desparejo = [
        { precio: 100000, costo: 0, adicTotal: 0, proporcion: 0.9 },
        { precio: 80000, costo: 0, adicTotal: 0, proporcion: 0.1 },
      ];
      expect(calcularTotalesVariacion(desparejo, 'MAYOR_PRECIO').precioCalculado).toBe(100000);
    });

    it('un adicional en media pizza cuesta la mitad', () => {
      const conExtra = [
        { precio: 100000, costo: 0, adicTotal: 10000, proporcion: 0.5 },
        { precio: 80000, costo: 0, adicTotal: 0, proporcion: 0.5 },
      ];
      expect(calcularTotalesVariacion(conExtra, 'MAYOR_PRECIO').totalAdicionales).toBe(5000);
    });

    it('el mismo adicional en toda la pizza se cobra entero', () => {
      const entero = [{ precio: 100000, costo: 0, adicTotal: 10000, proporcion: 1 }];
      expect(calcularTotalesVariacion(entero, 'MAYOR_PRECIO').totalAdicionales).toBe(10000);
    });

    it('el adicional sigue la proporción ajustada', () => {
      const ajustado = [
        { precio: 100000, costo: 0, adicTotal: 10000, proporcion: 0.6 },
        { precio: 80000, costo: 0, adicTotal: 0, proporcion: 0.4 },
      ];
      expect(calcularTotalesVariacion(ajustado, 'MAYOR_PRECIO').totalAdicionales).toBe(6000);
    });

    it('el costo se pondera por proporción', () => {
      expect(calcularTotalesVariacion(mitadYMitad, 'MAYOR_PRECIO').costoCalculado).toBe(35000);
    });

    it('estrategia desconocida cae en MAYOR_PRECIO', () => {
      expect(calcularTotalesVariacion(mitadYMitad, 'CUALQUIERA').precioCalculado).toBe(100000);
    });
  });
});
