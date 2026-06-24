import { create } from "zustand";

export type YoloType = "detection" | "classification" | "segmentation" | "pose";

interface YoloUploadState {
  yoloType: YoloType;
  setYoloType: (type: YoloType) => void;
}

export const useYoloUploadStore = create<YoloUploadState>()((set) => ({
  yoloType: "detection",
  setYoloType: (type) => set({ yoloType: type }),
}));
