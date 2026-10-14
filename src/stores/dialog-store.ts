import { create } from "zustand";

/** Dialogs opened from more than one place. */
interface DialogStore {
  source: boolean;
}

export const useDialogStore = create<DialogStore>()(() => ({ source: false }));

/** Opens or closes the data source dialog. */
export const setSourceDialogOpen = (open: boolean) => {
  useDialogStore.setState({ source: open });
};

export const openSourceDialog = () => {
  setSourceDialogOpen(true);
};
