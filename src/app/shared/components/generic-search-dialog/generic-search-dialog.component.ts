import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

export interface GenericSearchConfig {
  title: string;
  displayedColumns: string[];
  columnLabels: { [key: string]: string };
  searchFn: (query: string, page: number, pageSize: number) => Promise<{ items: any[], total: number }>;
  displayFn?: (item: any) => string;
}

interface ItemWithDisplayValues {
  [key: string]: any;
  __displayValues?: { [key: string]: string };
}

@Component({
  selector: 'app-generic-search-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule
  ],
  templateUrl: './generic-search-dialog.component.html',
  styleUrls: ['./generic-search-dialog.component.scss']
})
export class GenericSearchDialogComponent implements OnInit {
  searchControl = new FormControl('');
  items: ItemWithDisplayValues[] = [];
  displayedColumns: string[] = [];
  columnLabels: { [key: string]: string } = {};
  
  isLoading = false;
  totalItems = 0;
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions: number[] = [5, 10, 25, 50];
  
  private destroy$ = new Subject<void>();
  
  constructor(
    private dialogRef: MatDialogRef<GenericSearchDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public config: GenericSearchConfig
  ) {
    this.displayedColumns = [...config.displayedColumns, 'actions'];
    this.columnLabels = config.columnLabels;
  }
  
  ngOnInit(): void {
    // Setup search when typing with debounce
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.currentPage = 0;
        this.search();
      });
    
    // Initial search
    this.search();
  }
  
  async search(): Promise<void> {
    this.isLoading = true;
    try {
      const query = this.searchControl.value || '';
      const result = await this.config.searchFn(query, this.currentPage, this.pageSize);
      // Pre-compute display values for each item
      this.items = result.items.map(item => this.preComputeDisplayValues(item));
      this.totalItems = result.total;
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      this.isLoading = false;
    }
  }
  
  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
    this.search();
  }
  
  selectItem(item: any): void {
    // Remove the added display values property before returning the item
    if (item.__displayValues) {
      const { __displayValues, ...cleanItem } = item;
      this.dialogRef.close(cleanItem);
    } else {
      this.dialogRef.close(item);
    }
  }
  
  cancel(): void {
    this.dialogRef.close();
  }
  
  // Helper method to display item text for display fields
  displayText(item: any, column: string): string {
    if (!item) return '';
    
    // Handle nested properties (e.g., "persona.nombre")
    if (column.includes('.')) {
      const props = column.split('.');
      let value = item;
      for (const prop of props) {
        value = value?.[prop];
        if (value === undefined) return '';
      }
      return value;
    }
    
    return item[column] !== undefined ? item[column].toString() : '';
  }

  // Pre-compute display values for all columns
  private preComputeDisplayValues(item: any): ItemWithDisplayValues {
    const itemWithDisplay: ItemWithDisplayValues = { ...item, __displayValues: {} };
    
    // For each display column, pre-compute its display text
    for (const column of this.config.displayedColumns) {
      itemWithDisplay.__displayValues![column] = this.displayText(item, column);
    }
    
    return itemWithDisplay;
  }
  
  // Method to detect Enter key and trigger search
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.search();
    }
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
} 