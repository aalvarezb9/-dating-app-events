import type { NotificationTemplateKey } from './notification-templates';

/**
 * The placeholders of every email, as data: what the administration shows when someone writes a template (and checks when it is saved) and what the
 * notifications service gives the template when it renders it. One place, so the two cannot drift apart.
 *
 * A placeholder is written `{{name}}` in the subject and the body. The ones the sender gives are in `NotificationTemplateCatalog`
 * (`notification-templates.ts`); the ones marked `computed` are made from those by `templateContext` below (a date in the time zone of the business, a flag),
 * because a template written by hand or in a visual editor cannot call a function.
 */
export type PlaceholderGroup = 'person' | 'business' | 'service' | 'appointment' | 'account';

/** What the value is: a link is always http(s); a flag is true or false and goes in `{{#if}}` sections */
export type PlaceholderKind = 'text' | 'link' | 'date' | 'time' | 'number' | 'flag';

export interface PlaceholderSpec {
  /** `{{name}}` */
  name: string;
  /** What the person writing the template reads */
  label: string;
  description: string;
  /** What a preview shows in its place */
  example: string | number | boolean;
  /** The entity it comes from: the person, the business, the service, the appointment, the account */
  group: PlaceholderGroup;
  kind: PlaceholderKind;
  /** The email cannot be sent without it: the body must use it (a link, a code) */
  required?: boolean;
  /** Not every email of this event has it: use it inside an optional section (`{{#if name}} … {{/if}}`) */
  optional?: boolean;
  /** Made by `templateContext` from other data of the email (a date in a time zone, a flag), not given by the sender */
  computed?: boolean;
}

/** What each email is, for the list of the administration */
export const NOTIFICATION_TEMPLATE_INFO: Record<NotificationTemplateKey, { label: string; description: string }> = {
  EMAIL_VERIFICATION: { label: 'Confirmación de correo', description: 'Se envía al registrarse (negocio o cliente) para confirmar que el correo es suyo.' },
  ADMIN_LOGIN_CODE: { label: 'Código de ingreso de administrador', description: 'El segundo factor: el código de 6 dígitos que pide el login de un súper-administrador.' },
  ADMIN_INVITATION: { label: 'Invitación de administrador', description: 'Invita a un súper-administrador a elegir su contraseña.' },
  APPOINTMENT_ACCESS_LINK: { label: 'Enlace personal de la cita', description: 'Se envía al crear una cita: el enlace para verla, moverla, cancelarla o pagarla.' },
  APPOINTMENT_CONFIRMED: { label: 'Cita confirmada', description: 'La cita quedó confirmada.' },
  APPOINTMENT_CANCELLED: { label: 'Cita cancelada', description: 'La canceló el negocio, la persona o el sistema (reserva sin pagar que venció).' },
  APPOINTMENT_RESCHEDULED: { label: 'Cita reprogramada', description: 'La cita cambió de hora.' },
  APPOINTMENT_REMINDER: { label: 'Recordatorio de cita', description: 'Se envía un día antes de una cita confirmada.' },
  PAYMENT_PROOF_REJECTED: { label: 'Comprobante de pago rechazado', description: 'El negocio rechazó el comprobante de una transferencia; el cliente recibe una ventana nueva.' },
  BUSINESS_APPROVED: { label: 'Negocio aprobado', description: 'La plataforma aprobó el negocio: el dueño ya puede iniciar sesión.' },
  BUSINESS_REJECTED: { label: 'Solicitud de negocio rechazada', description: 'La plataforma rechazó la solicitud; lleva el motivo.' },
  BUSINESS_SUSPENDED: { label: 'Negocio suspendido', description: 'Se suspendió el negocio y se cerraron sus sesiones.' },
  BUSINESS_REACTIVATED: { label: 'Negocio reactivado', description: 'Un negocio suspendido volvió a estar activo.' },
};

// ---------------------------------------------------------------------------------------------------- the pieces
const greetingName: PlaceholderSpec = {
  name: 'greetingName',
  label: 'Nombre de quien recibe el correo',
  description: 'El nombre con que se saluda: el de la dirección, y si no hay, el de la persona del correo. Puede estar vacío.',
  example: 'Ana',
  group: 'person',
  kind: 'text',
  optional: true,
  computed: true,
};
const person = (name: string, label: string, description: string): PlaceholderSpec => ({ name, label, description, example: 'Ana', group: 'person', kind: 'text', optional: true });
const businessName = (optional = false): PlaceholderSpec => ({
  name: 'businessName',
  label: 'Nombre del negocio',
  description: 'El nombre del negocio de la cita o de la solicitud.',
  example: 'Salón Ángel',
  group: 'business',
  kind: 'text',
  ...(optional ? { optional: true } : {}),
});
const serviceName: PlaceholderSpec = { name: 'serviceName', label: 'Servicio', description: 'El servicio reservado.', example: 'Corte de cabello', group: 'service', kind: 'text' };
const timezone: PlaceholderSpec = {
  name: 'timezone',
  label: 'Zona horaria del negocio',
  description: 'La zona en que están escritas las fechas y horas (por ejemplo America/Tegucigalpa).',
  example: 'America/Tegucigalpa',
  group: 'appointment',
  kind: 'text',
};
const link = (label: string, description: string, required: boolean): PlaceholderSpec => ({
  name: 'link',
  label,
  description,
  example: 'https://salon.usebookly.app/abc123',
  group: 'account',
  kind: 'link',
  ...(required ? { required: true } : { optional: true }),
});
/** The date and the time of a moment in the data: `{{xDate}}` "sábado, 14 de noviembre de 2026" and `{{xTime}}` "10:00" */
const moment = (field: string, label: string, group: PlaceholderGroup, optional = false): PlaceholderSpec[] => [
  { name: `${field}Date`, label: `${label}: fecha`, description: 'Día de la semana, día, mes y año, en la zona del negocio.', example: 'jueves, 20 de junio de 2030', group, kind: 'date', computed: true, ...(optional ? { optional: true } : {}) },
  { name: `${field}Time`, label: `${label}: hora`, description: 'Hora y minutos (24 horas), en la zona del negocio.', example: '09:00', group, kind: 'time', computed: true, ...(optional ? { optional: true } : {}) },
];
const reason = (optional: boolean, description: string): PlaceholderSpec => ({ name: 'reason', label: 'Motivo', description, example: 'Documentos incompletos', group: 'business', kind: 'text', ...(optional ? { optional: true } : {}) });

/** The placeholders of every email, in the order the administration shows them. A key without an entry does not compile */
export const NOTIFICATION_PLACEHOLDERS: Record<NotificationTemplateKey, readonly PlaceholderSpec[]> = {
  EMAIL_VERIFICATION: [
    greetingName,
    person('name', 'Nombre', 'El nombre que dio la persona al registrarse.'),
    link('Enlace de confirmación', 'Lleva el token: confirma el correo. Es un secreto, no lo muestres en otro sitio.', true),
    ...moment('expiresAt', 'El enlace vence', 'account'),
  ],
  ADMIN_LOGIN_CODE: [
    greetingName,
    person('name', 'Nombre', 'El nombre del administrador.'),
    { name: 'code', label: 'Código', description: 'El código de 6 dígitos del segundo factor. Es un secreto.', example: '482913', group: 'account', kind: 'text', required: true },
    ...moment('expiresAt', 'El código vence', 'account'),
  ],
  ADMIN_INVITATION: [
    greetingName,
    person('name', 'Nombre', 'El nombre del administrador invitado.'),
    person('invitedBy', 'Quién invita', 'El nombre de quien lo invitó (puede no haberlo).'),
    link('Enlace para elegir la contraseña', 'Lleva el token de la invitación: sirve una vez.', true),
    ...moment('expiresAt', 'La invitación vence', 'account'),
  ],
  APPOINTMENT_ACCESS_LINK: [
    greetingName,
    person('attendeeName', 'Nombre de quien asiste', 'El nombre que dio quien reservó.'),
    businessName(),
    serviceName,
    ...moment('startsAt', 'La cita', 'appointment'),
    timezone,
    link('Enlace personal de la cita', 'Para ver, mover, cancelar o pagar la cita. Es personal: lleva su token.', true),
  ],
  APPOINTMENT_CONFIRMED: [
    greetingName,
    person('attendeeName', 'Nombre de quien asiste', 'El nombre que dio quien reservó.'),
    businessName(),
    serviceName,
    ...moment('startsAt', 'La cita', 'appointment'),
    timezone,
    link('Enlace de la cita', 'Para ver o modificar la cita (no siempre hay).', false),
  ],
  APPOINTMENT_CANCELLED: [
    greetingName,
    person('attendeeName', 'Nombre de quien asiste', 'El nombre que dio quien reservó.'),
    businessName(),
    serviceName,
    ...moment('startsAt', 'La cita', 'appointment'),
    timezone,
    { name: 'cancelledByBusiness', label: 'La canceló el negocio', description: 'Verdadero si la canceló el negocio. Úsalo en una sección opcional.', example: true, group: 'appointment', kind: 'flag', computed: true },
    { name: 'cancelledByCustomer', label: 'La canceló la persona', description: 'Verdadero si la canceló quien reservó.', example: false, group: 'appointment', kind: 'flag', computed: true },
    { name: 'cancelledBySystem', label: 'Venció la reserva', description: 'Verdadero si la reserva venció porque no llegó el comprobante de pago.', example: false, group: 'appointment', kind: 'flag', computed: true },
    reason(true, 'El motivo de la cancelación, si lo hay.'),
    { name: 'refundPercentage', label: 'Devolución (%)', description: 'Qué porcentaje de lo pagado se devuelve; solo si algo pagado se debe devolver.', example: 100, group: 'appointment', kind: 'number', optional: true },
  ],
  APPOINTMENT_RESCHEDULED: [
    greetingName,
    person('attendeeName', 'Nombre de quien asiste', 'El nombre que dio quien reservó.'),
    businessName(),
    serviceName,
    ...moment('previousStartsAt', 'Antes', 'appointment'),
    ...moment('startsAt', 'Ahora', 'appointment'),
    timezone,
    link('Enlace de la cita', 'Para ver la cita (no siempre hay).', false),
  ],
  APPOINTMENT_REMINDER: [
    greetingName,
    person('attendeeName', 'Nombre de quien asiste', 'El nombre que dio quien reservó.'),
    businessName(),
    serviceName,
    ...moment('startsAt', 'La cita', 'appointment'),
    timezone,
    link('Enlace de la cita', 'Para ver, mover o cancelar la cita (no siempre hay).', false),
  ],
  PAYMENT_PROOF_REJECTED: [
    greetingName,
    person('attendeeName', 'Nombre de quien asiste', 'El nombre que dio quien reservó.'),
    businessName(),
    serviceName,
    reason(false, 'Por qué el negocio rechazó el comprobante.'),
    ...moment('reservationExpiresAt', 'La nueva ventana de pago termina', 'appointment', true),
    timezone,
    link('Enlace para enviar otro comprobante', 'Para subir un comprobante nuevo (no siempre hay).', false),
  ],
  BUSINESS_APPROVED: [
    greetingName,
    person('ownerName', 'Nombre del dueño', 'El nombre del dueño del negocio.'),
    businessName(true),
    { name: 'loginUrl', label: 'Inicio de sesión del panel', description: 'El login del panel de los dueños DE ESTE ENTORNO (app.<entorno>.usebookly.app/login).', example: 'https://app.usebookly.app/login', group: 'account', kind: 'link', required: true },
  ],
  BUSINESS_REJECTED: [
    greetingName,
    person('ownerName', 'Nombre del dueño', 'El nombre del dueño del negocio.'),
    businessName(true),
    reason(true, 'El motivo que dio el administrador (el dueño lo recibe).'),
  ],
  BUSINESS_SUSPENDED: [
    greetingName,
    person('ownerName', 'Nombre del dueño', 'El nombre del dueño del negocio.'),
    businessName(true),
    reason(true, 'El motivo de la suspensión, si lo hay.'),
  ],
  BUSINESS_REACTIVATED: [greetingName, person('ownerName', 'Nombre del dueño', 'El nombre del dueño del negocio.'), businessName(true)],
};

// ---------------------------------------------------------------------------------------------------- the context of a template
/** The fields of the data that are moments in time: each one gives `<field>Date` and `<field>Time` */
const MOMENTS = ['startsAt', 'previousStartsAt', 'reservationExpiresAt', 'expiresAt'] as const;

const dateFormat = (locale: string, timeZone: string) => new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = (locale: string, timeZone: string) => new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * What a template can use: the data of the email, the name to greet, the moments written in the time zone of the business (`timezone`; the ones with none, like the
 * expiry of a link, in UTC) and the flags of who cancelled. A bad date or time zone throws (a `RangeError`): it will not get better by trying again.
 */
export function templateContext(data: Record<string, unknown>, options: { locale: string; greetingName?: string }): Record<string, unknown> {
  const context: Record<string, unknown> = { ...data, greetingName: options.greetingName };
  const timeZone = typeof data.timezone === 'string' && data.timezone ? data.timezone : 'UTC';
  for (const field of MOMENTS) {
    const value = data[field];
    if (typeof value === 'string' && value) {
      const moment = new Date(value);
      context[`${field}Date`] = dateFormat(options.locale, timeZone).format(moment);
      context[`${field}Time`] = timeFormat(options.locale, timeZone).format(moment);
    }
  }
  if (typeof data.cancelledBy === 'string') {
    context.cancelledByBusiness = data.cancelledBy === 'business';
    context.cancelledByCustomer = data.cancelledBy === 'customer';
    context.cancelledBySystem = data.cancelledBy === 'system';
  }
  return context;
}

/** The names of the placeholders of an email */
export const placeholderNames = (key: NotificationTemplateKey): string[] => NOTIFICATION_PLACEHOLDERS[key].map((placeholder) => placeholder.name);
