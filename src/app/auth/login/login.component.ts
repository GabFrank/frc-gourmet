import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../services/auth.service';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatCheckboxModule,
    MatDividerModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate('500ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ]),
    trigger('staggerFadeIn', [
      transition(':enter', [
        query('.stagger-item', [
          style({ opacity: 0, transform: 'translateY(20px)' }),
          stagger('100ms', [
            animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  isLoggingIn: boolean = false;
  hidePassword: boolean = true;
  welcomeMessages: string[] = [
    '¡Bienvenido de vuelta!',
    '¡Nos alegra verte!',
    '¡Un nuevo día, un nuevo comienzo!',
    '¡Qué bueno que estás aquí!',
    '¡Hola de nuevo!'
  ];
  welcomeMessage: string;
  currentHour: number;
  currentYear: number = new Date().getFullYear();
  timeGreeting: string;
  rememberMe: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.loginForm = this.fb.group({
      nickname: ['', [Validators.required]],
      password: ['', [Validators.required]],
      rememberMe: [false]
    });

    // Select a random welcome message
    this.welcomeMessage = this.welcomeMessages[Math.floor(Math.random() * this.welcomeMessages.length)];
    
    // Get current hour for time-based greeting
    this.currentHour = new Date().getHours();
    if (this.currentHour < 12) {
      this.timeGreeting = '¡Buenos días!';
    } else if (this.currentHour < 18) {
      this.timeGreeting = '¡Buenas tardes!';
    } else {
      this.timeGreeting = '¡Buenas noches!';
    }
  }

  ngOnInit(): void {
    // Check if already logged in
    if (this.authService.isLoggedIn) {
      this.router.navigate(['/']);
    }
    
    // Check for saved username
    const savedNickname = localStorage.getItem('saved_nickname');
    if (savedNickname) {
      this.loginForm.patchValue({
        nickname: savedNickname,
        rememberMe: true
      });
      this.rememberMe = true;
    }
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      return;
    }

    const { nickname, password, rememberMe } = this.loginForm.value;
    
    // Save nickname if remember me is checked
    if (rememberMe) {
      localStorage.setItem('saved_nickname', nickname);
    } else {
      localStorage.removeItem('saved_nickname');
    }

    this.isLoggingIn = true;

    try {
      const result = await this.authService.login(nickname, password);
      
      if (result.success) {
        // Display welcome animation
        this.snackBar.open(`¡Bienvenido, ${result.usuario?.persona?.nombre || nickname}!`, 'Cerrar', {
          duration: 3000,
          panelClass: 'success-snackbar'
        });
        
        // Navigate to home page
        this.router.navigate(['/']);
      } else {
        this.snackBar.open(result.message || 'Credenciales incorrectas', 'Cerrar', {
          duration: 5000,
          panelClass: 'error-snackbar'
        });
      }
    } catch (error) {
      this.snackBar.open('Error al iniciar sesión. Intente nuevamente.', 'Cerrar', {
        duration: 5000,
        panelClass: 'error-snackbar'
      });
      console.error('Login error:', error);
    } finally {
      this.isLoggingIn = false;
    }
  }
} 