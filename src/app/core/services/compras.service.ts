import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../database/repository.service';

@Injectable({
  providedIn: 'root'
})
export class ComprasService {
  constructor(private repositoryService: RepositoryService) {}

  /**
   * Get total amount due for a compra
   */
  async getCompraTotal(compraId: number | undefined): Promise<number> {
    if (!compraId) {
      console.error('Error: No compraId provided to getCompraTotal');
      return 0;
    }

    try {
      const detalles = await firstValueFrom(this.repositoryService.getCompraDetalles(compraId));
      return detalles.reduce((sum, detalle) => sum + (detalle.cantidad * detalle.valor), 0);
    } catch (error) {
      console.error('Error getting compra total:', error);
      return 0;
    }
  }

  /**
   * Get payments made for a compra
   */
  async getCompraPagos(compraId: number | undefined): Promise<any[]> {
    if (!compraId) {
      console.error('Error: No compraId provided to getCompraPagos');
      return [];
    }

    try {
      // In a real implementation, you would call a repository method
      // For now, we'll return an empty array
      return [];
    } catch (error) {
      console.error('Error getting compra pagos:', error);
      return [];
    }
  }

  /**
   * Get remaining amount to pay for a compra
   */
  async getCompraRemainingAmount(compraId: number | undefined): Promise<number> {
    if (!compraId) {
      console.error('Error: No compraId provided to getCompraRemainingAmount');
      return 0;
    }

    try {
      const total = await this.getCompraTotal(compraId);
      const pagos = await this.getCompraPagos(compraId);
      const pagosTotal = pagos.reduce((sum, pago) => sum + pago.monto, 0);
      return total - pagosTotal;
    } catch (error) {
      console.error('Error getting compra remaining amount:', error);
      return 0;
    }
  }
}
