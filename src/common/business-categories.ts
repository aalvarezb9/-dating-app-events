/**
 * The kinds of business of the platform (barbershop, clinic…). They are managed by the super administrators in `backend-dating-admin-saas`; this file is the contract every service
 * shares: the shape of a category, the closed list of placeholders its title and description templates may use, how to check and render a template, and the categories
 * a platform starts with (they are also what a service falls back to when the administration cannot be reached).
 */
export interface BusinessCategoryView {
  /** What a business stores as its type. Stable: it never changes */
  code: string;
  /** What people see in the list */
  name: string;
  /** The title of the public page of a business of this category that has none of its own */
  titleTemplate: string;
  descriptionTemplate: string;
  /** The position in the list: smaller first */
  sortOrder: number;
  active: boolean;
}

/** What a title or a description template may mention: the name of the business, where it is, and the name of its category */
export const CATEGORY_PLACEHOLDERS = ['name', 'city', 'state', 'country', 'category'] as const;

export type CategoryPlaceholder = (typeof CATEGORY_PLACEHOLDERS)[number];

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

/**
 * What is wrong with a template (an i18n key, with the detail after a colon), or null when it is fine. Only `{{placeholder}}` of the closed list is allowed: no other braces, no
 * markup (a title and a description are plain text that a search engine shows), and `{{name}}` must be there, because a title that does not say which business it is would be
 * the same for all of them.
 */
export function categoryTemplateProblem(template: string): string | null {
  if (/[<>]/.test(template)) {
    return 'category.error.template_markup';
  }
  const used = [...template.matchAll(PLACEHOLDER)].map((match) => match[1].trim());
  const unknown = used.find((placeholder) => !(CATEGORY_PLACEHOLDERS as readonly string[]).includes(placeholder));
  if (unknown !== undefined) {
    return `category.error.template_placeholder: ${unknown || '(empty)'}`;
  }
  if (/[{}]/.test(template.replace(PLACEHOLDER, ''))) {
    return 'category.error.template_braces';
  }
  if (!used.includes('name')) {
    return 'category.error.template_needs_name';
  }
  return null;
}

/**
 * Fills a template with what a business has. A placeholder with no value disappears, and what was left hanging around it is tidied up (double spaces, a space before a comma,
 * a trailing "en"), so a business with no state still reads well.
 */
export function renderCategoryTemplate(template: string, values: Partial<Record<CategoryPlaceholder, string | null | undefined>>): string {
  return template
    .replace(PLACEHOLDER, (_, key: string) => (values[key.trim() as CategoryPlaceholder] ?? '').trim())
    .replace(/\s+([,.:;])/g, '$1')
    .replace(/(,\s*){2,}/g, ', ')
    .replace(/\s+(en|in|de)\s*([,.:;]|$)/gi, '$2')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.:;]+|[\s,]+$/g, '')
    .trim();
}

/** What a platform starts with, and what a service uses when the administration cannot be reached (the five types a registration always offered) */
export const DEFAULT_BUSINESS_CATEGORIES: readonly BusinessCategoryView[] = [
  {
    code: 'barbershop',
    name: 'Barbería',
    titleTemplate: '{{category}} {{name}} en {{city}}',
    descriptionTemplate: 'Reserva tu cita en {{name}}, barbería en {{city}}, {{country}}: cortes, barba y más. Elige servicio y horario en línea.',
    sortOrder: 10,
    active: true,
  },
  {
    code: 'clinic',
    name: 'Clínica',
    titleTemplate: '{{category}} {{name}} en {{city}}',
    descriptionTemplate: 'Agenda tu consulta en {{name}}, clínica en {{city}}, {{country}}. Elige el servicio, el profesional y el horario en línea.',
    sortOrder: 20,
    active: true,
  },
  {
    code: 'studio',
    name: 'Estudio',
    titleTemplate: '{{category}} {{name}} en {{city}}',
    descriptionTemplate: 'Reserva tu cita en {{name}}, estudio en {{city}}, {{country}}. Mira los servicios y elige tu horario en línea.',
    sortOrder: 30,
    active: true,
  },
  {
    code: 'workshop',
    name: 'Taller',
    titleTemplate: '{{category}} {{name}} en {{city}}',
    descriptionTemplate: 'Agenda tu cita en {{name}}, taller en {{city}}, {{country}}. Elige el servicio y el horario en línea.',
    sortOrder: 40,
    active: true,
  },
  {
    code: 'other',
    name: 'Otro',
    titleTemplate: '{{name}} en {{city}}',
    descriptionTemplate: 'Reserva tu cita en {{name}}, en {{city}}, {{country}}. Mira los servicios y elige tu horario en línea.',
    sortOrder: 1000,
    active: true,
  },
];
