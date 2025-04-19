import { Injectable } from '@angular/core';
import { firstValueFrom, Observable, of } from 'rxjs';
import { RepositoryService } from '../../database/repository.service';
import { Pago as PagoEntity } from '../../database/entities';
import { PagoEstado } from '../../database/entities/compras/estado.enum';

// Define a PagoDetalle interface for better type safety
export interface PagoDetalle {
  id?: number;
  descripcion: string;
  valor: number;
  monedaId?: number;
  formaPagoId?: number;
}

// Define a simpler Pago model for the service
export interface Pago {
  id?: number;
  compraId: number;
  fecha: Date;
  monto: number;
  metodoPago: string;
  cajaId?: number;
  activo: boolean;
  estado?: PagoEstado;
  detalles?: PagoDetalle[];
}

@Injectable({
  providedIn: 'root'
})
export class PagosService {
  constructor(private repositoryService: RepositoryService) {}

  /**
   * Get a payment by ID
   */
  async getPagoById(id: number | undefined): Promise<Pago | null> {
    if (!id) {
      console.error('Error: No pago ID provided to getPagoById');
      return null;
    }

    try {
      // This is a mock implementation.
      // In a real implementation, you would fetch from repository or API
      return {
        id: id,
        compraId: 1,
        fecha: new Date(),
        monto: 1000,
        metodoPago: 'EFECTIVO',
        cajaId: 1,
        activo: true,
        estado: PagoEstado.ABIERTO
      };
    } catch (error) {
      console.error('Error getting pago by ID:', error);
      return null;
    }
  }

  /**
   * Create a new payment
   */
  async createPago(pago: Pago): Promise<Pago> {
    try {
      // This is a mock implementation.
      // In a real implementation, you would call the repository service
      return {
        ...pago,
        id: Math.floor(Math.random() * 1000) // Mock ID generation
      };
    } catch (error) {
      console.error('Error creating pago:', error);
      throw error;
    }
  }

  /**
   * Update an existing payment
   */
  async updatePago(id: number | undefined, pago: Pago): Promise<Pago> {
    if (!id) {
      throw new Error('No se proporcionó un ID válido para actualizar el pago');
    }

    try {
      // This is a mock implementation.
      // In a real implementation, you would call the repository service
      return {
        ...pago,
        id: id
      };
    } catch (error) {
      console.error('Error updating pago:', error);
      throw error;
    }
  }

  /**
   * Get payments for a specific compra
   */
  async getPagosByCompra(compraId: number | undefined): Promise<Pago[]> {
    if (!compraId) {
      console.error('Error: No compraId provided to getPagosByCompra');
      return [];
    }

    try {
      // This is a mock implementation.
      // In a real implementation, you would call the repository service
      return [];
    } catch (error) {
      console.error('Error getting pagos for compra:', error);
      return [];
    }
  }
}
