import { create } from "zustand";

export type YoloDatasetTask =
  | "object_detection"
  | "instance_segmentation"
  | "pose_estimation"
  | "image_classification"
  | "obb";

interface YoloDatasetTaskState {
  yoloTask: YoloDatasetTask;
  setYoloTask: (task: YoloDatasetTask) => void;
}

export const useYoloDatasetTaskStore = create<YoloDatasetTaskState>()((set) => ({
  yoloTask: "object_detection",
  setYoloTask: (task) => set({ yoloTask: task }),
}));
