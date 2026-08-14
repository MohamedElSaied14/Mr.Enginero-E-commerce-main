import { JsonPipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormGroup, FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgIf } from '@angular/common'; // <-- import NgIf

@Component({ selector: 'app-reactive-form',
   imports: [ReactiveFormsModule, NgIf,JsonPipe],
   templateUrl: './reactive-form.html',
   styleUrls: ['./reactive-form.css'],
})
export class ReactiveFormComponent {
  form: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      check: [false] // checkbox
    });
  }

  submit() {
    if (this.form.valid) {
      console.log(this.form.value);
      alert('Form submitted successfully!');
    } else {
      alert('Please fill the form correctly.');
    }
  }
}