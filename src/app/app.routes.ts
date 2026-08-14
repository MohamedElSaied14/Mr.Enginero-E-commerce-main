import { Routes } from '@angular/router';
import { adminGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'Mr.Enginero — PC hardware & gaming gear in Egypt',
    loadComponent: () => import('./Components/home/home').then((m) => m.HomeComponent),
  },
  {
    path: 'shop',
    title: 'Shop — Mr.Enginero',
    loadComponent: () => import('./Components/shop/shop').then((m) => m.ShopComponent),
  },
  {
    path: 'deals',
    title: 'Deals — Mr.Enginero',
    loadComponent: () => import('./Components/deals/deals').then((m) => m.DealsComponent),
  },
  {
    path: 'stores',
    title: 'Supplier directory — Mr.Enginero',
    // Sourcing data, not a customer page.
    canActivate: [adminGuard],
    loadComponent: () => import('./Components/stores/stores').then((m) => m.StoresComponent),
  },
  {
    path: 'cart',
    title: 'Your cart — Mr.Enginero',
    loadComponent: () => import('./Components/cart/cart').then((m) => m.CartComponent),
  },
  {
    path: 'checkout',
    title: 'Checkout — Mr.Enginero',
    loadComponent: () => import('./Components/checkout/checkout').then((m) => m.CheckoutComponent),
  },
  {
    path: 'order/:ref',
    title: 'Your order — Mr.Enginero',
    loadComponent: () =>
      import('./Components/order-confirmation/order-confirmation').then((m) => m.OrderConfirmationComponent),
  },
  {
    path: 'wishlist',
    title: 'Wishlist — Mr.Enginero',
    loadComponent: () => import('./Components/wishlist/wishlist').then((m) => m.WishlistComponent),
  },
  {
    path: 'product/:id',
    loadComponent: () =>
      import('./Components/product-details/product-details').then((m) => m.ProductDetailsComponent),
  },
  {
    path: 'about',
    title: 'About — Mr.Enginero',
    loadComponent: () => import('./Components/about/about').then((m) => m.AboutComponent),
  },
  {
    path: 'contact',
    title: 'Contact — Mr.Enginero',
    loadComponent: () => import('./Components/contact/contact').then((m) => m.ContactComponent),
  },
  {
    path: 'login',
    title: 'Sign in — Mr.Enginero',
    loadComponent: () => import('./Components/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/callback',
    title: 'Signing you in — Mr.Enginero',
    loadComponent: () =>
      import('./Components/auth-callback/auth-callback').then((m) => m.AuthCallbackComponent),
  },
  {
    path: 'register',
    title: 'Create an account — Mr.Enginero',
    loadComponent: () => import('./Components/register/register').then((m) => m.RegisterComponent),
  },
  {
    path: 'dashboard',
    title: 'Admin dashboard — Mr.Enginero',
    canActivate: [adminGuard],
    loadComponent: () => import('./Components/dashboard/dashboard').then((m) => m.DashboardComponent),
  },
  { path: '**', redirectTo: '' },
];
