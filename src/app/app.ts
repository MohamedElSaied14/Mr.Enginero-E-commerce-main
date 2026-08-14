import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './Components/header/header';
import { Footer } from './Components/footer/footer';
import { ToastHostComponent } from './Components/shared/toast-host';
import { VerifyBannerComponent } from './Components/shared/verify-banner';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Header, Footer, ToastHostComponent, VerifyBannerComponent],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <app-verify-banner></app-verify-banner>
    <app-header></app-header>
    <main id="main" tabindex="-1">
      <router-outlet></router-outlet>
    </main>
    <app-footer></app-footer>
    <app-toast-host></app-toast-host>
  `,
  styleUrl: './app.css',
})
export class App {}
