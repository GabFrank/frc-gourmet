import { AfterViewInit, Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Diálogo Sí/No para decidir si se imprime el pagaré de una venta a crédito.
 * - Por defecto queda seleccionado "No".
 * - Se puede navegar entre las opciones con las flechas ← →.
 * - Enter confirma la opción enfocada.
 * Devuelve `true` (imprimir) o `false` (no imprimir; también al cerrar con ESC).
 */
@Component({
  selector: 'app-imprimir-pagare-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Imprimir pagaré</h2>
    <mat-dialog-content>
      <p class="ip-msg">¿Desea imprimir el pagaré de esta venta a crédito?</p>
      <p class="ip-hint">Navegá con ← → y confirmá con Enter</p>
    </mat-dialog-content>
    <mat-dialog-actions class="ip-actions">
      <button #noBtn mat-stroked-button class="ip-btn" [class.ip-active]="selected === 'no'"
              (click)="responder(false)" (focus)="selected = 'no'">
        <mat-icon>close</mat-icon> No
      </button>
      <button #siBtn mat-flat-button color="primary" class="ip-btn" [class.ip-active]="selected === 'si'"
              (click)="responder(true)" (focus)="selected = 'si'">
        <mat-icon>print</mat-icon> Sí
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .ip-msg { margin: 0 0 6px; }
    .ip-hint { margin: 0; font-size: 0.8rem; color: var(--text-secondary); }
    .ip-actions { display: flex; justify-content: flex-end; gap: 12px; padding: 8px 24px 20px; }
    .ip-btn { min-width: 104px; }
    .ip-active { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  `],
})
export class ImprimirPagareDialogComponent implements AfterViewInit {
  @ViewChild('noBtn', { read: ElementRef }) noBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('siBtn', { read: ElementRef }) siBtn!: ElementRef<HTMLButtonElement>;

  selected: 'si' | 'no' = 'no';

  constructor(private dialogRef: MatDialogRef<ImprimirPagareDialogComponent, boolean>) {}

  ngAfterViewInit(): void {
    // Enfocar "No" por defecto.
    setTimeout(() => this.noBtn?.nativeElement?.focus(), 0);
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.selected = this.selected === 'no' ? 'si' : 'no';
      const target = this.selected === 'no' ? this.noBtn : this.siBtn;
      target?.nativeElement?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.responder(this.selected === 'si');
    }
  }

  responder(imprimir: boolean): void {
    this.dialogRef.close(imprimir);
  }
}
