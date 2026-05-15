import type { FractureGroundTruthCase } from "./fractureBenchmark";

export const FRACTURE_GROUND_TRUTH: FractureGroundTruthCase[] = [
  {
    file_name: "fracatlas_01_IMG0000019.jpg",
    image_url: "/fracture-samples/fracatlas_01_IMG0000019.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "hand/wrist fracture",
    fracture_count: 1,
    boxes: [{ x: 53.92, y: 32.26, width: 11.86, height: 5.12 }]
  },
  {
    file_name: "fracatlas_02_IMG0000025.jpg",
    image_url: "/fracture-samples/fracatlas_02_IMG0000025.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "hand fracture",
    fracture_count: 1,
    boxes: [{ x: 50.92, y: 87.26, width: 5.39, height: 6.66 }]
  },
  {
    file_name: "fracatlas_03_IMG0000261.jpg",
    image_url: "/fracture-samples/fracatlas_03_IMG0000261.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "multiple hand fractures",
    fracture_count: 2,
    boxes: [
      { x: 74.58, y: 35.99, width: 8.29, height: 4.11 },
      { x: 26.72, y: 35.09, width: 7.19, height: 4.27 }
    ]
  },
  {
    file_name: "fracatlas_04_IMG0000307.jpg",
    image_url: "/fracture-samples/fracatlas_04_IMG0000307.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "multiple finger/hand fractures",
    fracture_count: 3,
    boxes: [
      { x: 20.58, y: 47.52, width: 7.33, height: 5.69 },
      { x: 75.91, y: 48.76, width: 7.13, height: 3.63 },
      { x: 66.67, y: 70.79, width: 2.91, height: 3.8 }
    ]
  },
  {
    file_name: "fracatlas_05_finger.jpg",
    image_url: "/fracture-samples/fracatlas_05_finger.jpg",
    mura_region: "finger",
    fracture: "fracture",
    fracture_type: "finger avulsion fracture",
    fracture_count: 1,
    boxes: [{ x: 28.0, y: 50.0, width: 42.0, height: 10.0 }]
  },
  {
    file_name: "fracatlas_06_forearm.jpg",
    image_url: "/fracture-samples/fracatlas_06_forearm.jpg",
    mura_region: "forearm",
    fracture: "fracture",
    fracture_type: "distal forearm buckle fracture",
    fracture_count: 1,
    boxes: [{ x: 30.0, y: 62.0, width: 38.0, height: 8.0 }]
  },
  {
    file_name: "fracatlas_07_shoulder.jpg",
    image_url: "/fracture-samples/fracatlas_07_shoulder.jpg",
    mura_region: "shoulder",
    fracture: "fracture",
    fracture_type: "proximal humerus fracture",
    fracture_count: 1,
    boxes: [{ x: 28.0, y: 22.0, width: 38.0, height: 32.0 }]
  },
  {
    file_name: "fracatlas_08_wrist.jpg",
    image_url: "/fracture-samples/fracatlas_08_wrist.jpg",
    mura_region: "wrist",
    fracture: "fracture",
    fracture_type: "wrist greenstick fracture",
    fracture_count: 1,
    boxes: [{ x: 25.0, y: 28.0, width: 48.0, height: 14.0 }]
  },
  {
    file_name: "fracatlas_09_IMG0002302.jpg",
    image_url: "/fracture-samples/fracatlas_09_IMG0002302.jpg",
    mura_region: "shoulder",
    fracture: "fracture",
    fracture_type: "shoulder/proximal humerus fracture",
    fracture_count: 1,
    boxes: [{ x: 63.76, y: 36.65, width: 11.61, height: 11.26 }]
  },
  {
    file_name: "fracatlas_10_IMG0002620.jpg",
    image_url: "/fracture-samples/fracatlas_10_IMG0002620.jpg",
    mura_region: "shoulder",
    fracture: "fracture",
    fracture_type: "shoulder fracture",
    fracture_count: 1,
    boxes: [{ x: 44.09, y: 20.23, width: 8.31, height: 7.89 }]
  }
];
