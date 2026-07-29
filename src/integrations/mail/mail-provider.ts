export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailMessage {
  recipient: string;
  subject: string;
  text: string;
  html: string;
  deliveryId?: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
