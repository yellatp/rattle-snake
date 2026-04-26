import type { UserProfile } from '../store/profiles';

export function applyProfileToTemplate(
  template: Record<string, unknown>,
  profile: UserProfile
): Record<string, unknown> {
  const contact = (template.contact ?? {}) as Record<string, string>;
  const sections = (template.sections ?? {}) as Record<string, unknown>;

  const updatedContact = {
    ...contact,
    ...(profile.fullName    && { name:      profile.fullName }),
    ...(profile.email       && { email:     profile.email }),
    ...(profile.phone       && { phone:     profile.phone }),
    ...(profile.location    && { location:  profile.location }),
    ...(profile.linkedin    && { linkedin:  profile.linkedin }),
    ...(profile.github      && { github:    profile.github }),
    ...(profile.portfolio   && { portfolio: profile.portfolio }),
  };

  // If the profile has parsed resume sections (from BYOP), inject them fully.
  // Contact fields always override. Sections only inject when present.
  const rs = profile.resumeSections;
  const updatedSections = rs ? {
    ...sections,
    ...(rs.summary                   ? { summary:          { ...(sections.summary as object ?? {}),  content: rs.summary, editable: true } } : {}),
    ...(rs.experience?.length        ? { experience:        rs.experience } : {}),
    ...(rs.education?.length         ? { education:         rs.education  } : {}),
    ...(rs.skills?.categories?.length ? { skills:           { ...(sections.skills as object ?? {}), categories: rs.skills.categories, editable: true } } : {}),
    ...(rs.certifications?.length    ? { certifications:    rs.certifications } : {}),
  } : sections;

  return { ...template, contact: updatedContact, sections: updatedSections };
}
