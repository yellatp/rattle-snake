import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserProfile {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  isProtected: boolean;
  pinHash?: string;

  // Contact
  fullName: string;
  email: string;
  phone: string;
  location: string;

  // Links
  linkedin: string;
  github: string;
  portfolio: string;

  // Professional
  currentTitle: string;
  bio: string;
}

export async function hashPin(pin: string): Promise<string> {
  const encoded = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  return (await hashPin(pin)) === stored;
}

function blankProfile(displayName = 'New Profile'): Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    displayName,
    isProtected: false,
    pinHash: undefined,
    fullName: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    github: '',
    portfolio: '',
    currentTitle: '',
    bio: '',
  };
}

interface ProfileStore {
  profiles: UserProfile[];
  activeProfileId: string | null;

  createProfile: (displayName?: string) => UserProfile;
  updateProfile: (id: string, updates: Partial<Omit<UserProfile, 'id' | 'createdAt'>>) => void;
  deleteProfile: (id: string) => void;
  setActiveProfile: (id: string | null) => void;
  getActiveProfile: () => UserProfile | null;
}

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: null,

      createProfile: (displayName = 'New Profile') => {
        const now = new Date().toISOString();
        const profile: UserProfile = {
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          ...blankProfile(displayName),
        };
        set(state => ({ profiles: [...state.profiles, profile] }));
        return profile;
      },

      updateProfile: (id, updates) => {
        set(state => ({
          profiles: state.profiles.map(p =>
            p.id === id
              ? { ...p, ...updates, updatedAt: new Date().toISOString() }
              : p
          ),
        }));
      },

      deleteProfile: (id) => {
        set(state => ({
          profiles: state.profiles.filter(p => p.id !== id),
          activeProfileId: state.activeProfileId === id ? null : state.activeProfileId,
        }));
      },

      setActiveProfile: (id) => set({ activeProfileId: id }),

      getActiveProfile: () => {
        const { profiles, activeProfileId } = get();
        return profiles.find(p => p.id === activeProfileId) ?? null;
      },
    }),
    { name: 'rs-profiles' }
  )
);
