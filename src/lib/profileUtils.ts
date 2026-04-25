import type { UserProfile } from '../store/profiles';

export function applyProfileToTemplate(template: Record<string, unknown>, profile: UserProfile): Record<string, unknown> {
  const contact = (template.contact ?? {}) as Record<string, string>;
  return {
    ...template,
    contact: {
      ...contact,
      ...(profile.fullName    && { name:      profile.fullName }),
      ...(profile.email       && { email:     profile.email }),
      ...(profile.phone       && { phone:     profile.phone }),
      ...(profile.location    && { location:  profile.location }),
      ...(profile.linkedin    && { linkedin:  profile.linkedin }),
      ...(profile.github      && { github:    profile.github }),
      ...(profile.portfolio   && { portfolio: profile.portfolio }),
    },
  };
}
