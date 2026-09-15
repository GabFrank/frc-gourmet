import { TestBed } from '@angular/core/testing';
import { DeepLinkService } from './deep-link.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TabsService } from './tabs.service';

describe('DeepLinkService', () => {
  let service: DeepLinkService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DeepLinkService,
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
        { provide: TabsService, useValue: {} },
      ],
    });
    service = TestBed.inject(DeepLinkService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('parseDeepLink', () => {
    it('should parse valid deep link with hash prefix', () => {
      const result = service.parseDeepLink('#/o/compra/123');
      expect(result).toEqual({ tipo: 'compra', id: 123 });
    });

    it('should parse valid deep link without hash prefix', () => {
      const result = service.parseDeepLink('/o/gasto/456');
      expect(result).toEqual({ tipo: 'gasto', id: 456 });
    });

    it('should return null for invalid format', () => {
      expect(service.parseDeepLink('#/compra/123')).toBeNull();
      expect(service.parseDeepLink('/o/compra')).toBeNull();
      expect(service.parseDeepLink('/o/compra/abc')).toBeNull();
      expect(service.parseDeepLink('#/o/compra/0')).toBeNull();
      expect(service.parseDeepLink('#/o/compra/-5')).toBeNull();
      expect(service.parseDeepLink('')).toBeNull();
    });

    it('should parse all supported tipos', () => {
      expect(service.parseDeepLink('#/o/compra/1')).toEqual({ tipo: 'compra', id: 1 });
      expect(service.parseDeepLink('#/o/gasto/2')).toEqual({ tipo: 'gasto', id: 2 });
      expect(service.parseDeepLink('#/o/vale/3')).toEqual({ tipo: 'vale', id: 3 });
      expect(service.parseDeepLink('#/o/pago/4')).toEqual({ tipo: 'pago', id: 4 });
    });
  });
});
