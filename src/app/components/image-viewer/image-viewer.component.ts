import { Component, Inject, HostBinding, AfterViewInit, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ImageViewerData {
  imageUrl: string;
  title?: string;
}

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="image-viewer-container">
      <div class="image-viewer-header">
        <h2 *ngIf="data.title">{{ data.title }}</h2>
        <button mat-icon-button (click)="close()" class="close-button">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="image-viewer-content">
        <div class="image-wrapper">
          <img #imageElement [src]="data.imageUrl" alt="Image preview" class="fullsize-image"
               (error)="handleImageError($event)" (load)="handleImageLoad()">
        </div>
        <div *ngIf="imageError" class="image-error">
          <mat-icon color="warn">error</mat-icon>
          <p>Failed to load image</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }

    .image-viewer-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      overflow: hidden;
    }
    
    .image-viewer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    }
    
    .image-viewer-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
    }
    
    .close-button {
      margin-left: auto;
      width: 40px !important;
      height: 40px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    
    .close-button .mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      line-height: 24px;
    }
    
    .image-viewer-content {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: auto;
      padding: 24px;
      background-color: rgba(0, 0, 0, 0.03);
    }
    
    .image-wrapper {
      display: flex;
      justify-content: center;
      align-items: center;
      max-width: 100%;
      max-height: 100%;
    }
    
    .fullsize-image {
      max-height: 70vh;
      max-width: 100%;
      object-fit: contain;
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
      border-radius: 4px;
      background-color: white;
    }
    
    .image-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #f44336;
    }
    
    .image-error mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
    }
    
    :host-context(.dark-theme) {
      .image-viewer-header {
        border-bottom-color: rgba(255, 255, 255, 0.12);
      }
      
      .image-viewer-content {
        background-color: rgba(0, 0, 0, 0.2);
      }
      
      .fullsize-image {
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);
        background-color: #333;
      }
    }
  `]
})
export class ImageViewerComponent implements OnInit, AfterViewInit {
  @ViewChild('imageElement') imageElement!: ElementRef<HTMLImageElement>;
  imageError = false;
  imageLoaded = false;

  constructor(
    public dialogRef: MatDialogRef<ImageViewerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ImageViewerData
  ) {
    console.log('data', this.data);
  }

  ngOnInit(): void {
    // Validate image URL
    if (!this.data.imageUrl) {
      console.error('No image URL provided to ImageViewerComponent');
      this.imageError = true;
    }
  }

  ngAfterViewInit(): void {
    // Modern approach to ensure image renders properly
    if (!this.imageLoaded && !this.imageError) {
      setTimeout(() => {
        // Force a repaint in a cleaner way
        if (this.imageElement?.nativeElement) {
          const img = this.imageElement.nativeElement;
          img.style.opacity = '0';
          setTimeout(() => {
            img.style.opacity = '1';
          }, 50);
        }
      }, 100);
    }
  }

  handleImageError(event: any): void {
    console.error('Image failed to load:', event);
    this.imageError = true;
  }

  handleImageLoad(): void {
    this.imageLoaded = true;
  }

  close(): void {
    this.dialogRef.close();
  }
} 