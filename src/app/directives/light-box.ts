import { Directive, ElementRef, HostListener } from '@angular/core';

@Directive({
  selector: '[appLightBox]',
  standalone: true   // 👈 ADD THIS
})
export class LightBox {

  constructor(private elementref: ElementRef) {
    this.elementref.nativeElement.style.border = '3px solid red';
  }

  @HostListener('mouseover')
  mouseover() {
    this.elementref.nativeElement.style.border = '3px solid blue';
  }

  @HostListener('mouseout')
  mouseout() {
    this.elementref.nativeElement.style.border = '3px solid green';
  }
}