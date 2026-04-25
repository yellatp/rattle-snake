import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface JobTarget {
  company: string;
  roleTitle: string;
  jobDescription: string;
}

interface JobContextState {
  active: JobTarget | null;
  modalOpen: boolean;
  setActive: (job: JobTarget) => void;
  clearActive: () => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useJobContext = create<JobContextState>()(
  persist(
    (set) => ({
      active: null,
      modalOpen: false,
      setActive: (job) => set({ active: { ...job }, modalOpen: false }),
      clearActive: () => set({ active: null }),
      openModal:  () => set({ modalOpen: true }),
      closeModal: () => set({ modalOpen: false }),
    }),
    {
      name: 'rs-active-job',
      partialize: (s) => ({ active: s.active }), // never persist modal open state
    }
  )
);
