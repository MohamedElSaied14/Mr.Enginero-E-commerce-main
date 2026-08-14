import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { BRAND, mailHref, telHref, whatsappHref } from '../../brand';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './footer.html',
  styleUrls: ['./footer.css'],
})
export class Footer {
  readonly brand = BRAND;
  readonly year = new Date().getFullYear();
  readonly telLink = telHref;
  readonly mailLink = mailHref;
  readonly whatsappLink = whatsappHref('Hello Mr.Enginero, I have a question.');
}
