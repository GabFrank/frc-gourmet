import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private darkThemeKey = 'darkTheme';
  private isDarkThemeSubject = new BehaviorSubject<boolean>(this.getStoredThemePreference());
  
  constructor() {
    // Check for system preference if no stored preference
    if (!localStorage.getItem(this.darkThemeKey)) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.setDarkTheme(prefersDark);
    }
    
    // Apply theme on service initialization
    this.applyTheme(this.isDarkThemeSubject.value);
  }
  
  isDarkTheme(): Observable<boolean> {
    return this.isDarkThemeSubject.asObservable();
  }
  
  getCurrentThemeValue(): boolean {
    return this.isDarkThemeSubject.value;
  }
  
  toggleTheme(): void {
    this.setDarkTheme(!this.isDarkThemeSubject.value);
  }
  
  setDarkTheme(isDark: boolean): void {
    localStorage.setItem(this.darkThemeKey, JSON.stringify(isDark));
    this.isDarkThemeSubject.next(isDark);
    this.applyTheme(isDark);
  }
  
  private getStoredThemePreference(): boolean {
    const storedPreference = localStorage.getItem(this.darkThemeKey);
    return storedPreference ? JSON.parse(storedPreference) : false;
  }
  
  private applyTheme(isDark: boolean): void {
    // Add or remove the dark theme class from the body
    if (isDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }
} 